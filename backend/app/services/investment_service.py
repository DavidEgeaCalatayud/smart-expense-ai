from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.investment_schemas import (
    InvestmentHistoryPoint, InvestmentHoldingsUpdateRequest, InvestmentMovementResponse,
    InvestmentPortfolioHistoryResponse, InvestmentPortfolioResponse,
    InvestmentPositionCreateRequest, InvestmentPositionResponse,
    NavRefreshResponse, NavRefreshResult,
)
from app.models.financial_account import FinancialAccount, FinancialAccountBalanceSnapshot
from app.models.investment import FundNavQuote, InvestmentPosition, InvestmentPositionMovement
from app.services.investment_nav_provider import fetch_public_nav, is_auto_priced

MONEY_CENT = Decimal("0.01")
NAV_PRECISION = Decimal("0.000001")
UNITS_PRECISION = Decimal("0.00000001")
PERCENT_CENT = Decimal("0.01")
ZERO = Decimal("0")

def _money(value: Decimal | int | str) -> str:
    return format(Decimal(value).quantize(MONEY_CENT, rounding=ROUND_HALF_UP), "f")

def _units(value: Decimal | int | str) -> str:
    return format(Decimal(value).quantize(UNITS_PRECISION), "f").rstrip("0").rstrip(".") or "0"

def _nav(value: Decimal | int | str) -> str:
    return format(Decimal(value).quantize(NAV_PRECISION), "f").rstrip("0").rstrip(".")

def _percent(value: Decimal) -> str:
    return format(value.quantize(PERCENT_CENT, rounding=ROUND_HALF_UP), "f")

def _latest_quote(db: Session, isin: str, as_of: date | None = None) -> FundNavQuote | None:
    query = select(FundNavQuote).where(FundNavQuote.isin == isin)
    if as_of is not None:
        query = query.where(FundNavQuote.valuation_date <= as_of)
    return db.scalar(query.order_by(FundNavQuote.valuation_date.desc(), FundNavQuote.fetched_at.desc()).limit(1))

def _value(db: Session, position: InvestmentPosition, as_of: date | None = None) -> tuple[Decimal, FundNavQuote | None, str]:
    quote = _latest_quote(db, position.isin, as_of)
    if quote is None:
        return Decimal(position.cost_total).quantize(MONEY_CENT), None, "cost_fallback"
    value = (Decimal(position.units) * Decimal(quote.nav)).quantize(MONEY_CENT, rounding=ROUND_HALF_UP)
    return value, quote, "nav"

def _position_response(db: Session, position: InvestmentPosition) -> InvestmentPositionResponse:
    current_value, quote, source = _value(db, position)
    cost = Decimal(position.cost_total).quantize(MONEY_CENT)
    gain = current_value - cost
    return InvestmentPositionResponse(
        id=str(position.id), financialAccountId=str(position.financial_account_id),
        name=position.name, isin=position.isin, units=_units(position.units),
        costTotal=_money(cost), currentValue=_money(current_value), gainAmount=_money(gain),
        gainPercent=None if cost == ZERO else _percent((gain / cost) * Decimal("100")),
        latestNav=_nav(quote.nav) if quote else None,
        navDate=quote.valuation_date if quote else None,
        navProvider=quote.provider if quote else None,
        navSourceUrl=quote.source_url if quote else None,
        valueSource=source, autoPricingAvailable=is_auto_priced(position.isin),
        updatedAt=position.updated_at,
    )

def _active_positions(db: Session, user_id: UUID, account_id: UUID) -> list[InvestmentPosition]:
    return list(db.scalars(
        select(InvestmentPosition).where(
            InvestmentPosition.user_id == user_id,
            InvestmentPosition.financial_account_id == account_id,
            InvestmentPosition.archived.is_(False),
        ).order_by(InvestmentPosition.created_at.asc(), InvestmentPosition.id.asc())
    ).all())

def _revalue_account(db: Session, user_id: UUID, account_id: UUID, now: datetime | None = None) -> bool:
    account = db.scalar(select(FinancialAccount).where(
        FinancialAccount.id == account_id,
        FinancialAccount.user_id == user_id,
        FinancialAccount.archived.is_(False),
    ).with_for_update())
    if account is None:
        return False
    positions = _active_positions(db, user_id, account_id)
    total = sum((_value(db, p)[0] for p in positions), ZERO).quantize(MONEY_CENT, rounding=ROUND_HALF_UP)
    previous = Decimal(account.current_balance).quantize(MONEY_CENT)
    if previous == total:
        return False
    recorded_at = now or datetime.now(timezone.utc)
    account.current_balance = total
    account.balance_updated_at = recorded_at
    db.add(FinancialAccountBalanceSnapshot(
        financial_account_id=account.id, user_id=user_id, balance=total,
        include_in_net_worth=account.include_in_net_worth, archived=account.archived,
        recorded_at=recorded_at, source="market",
    ))
    return True

def create_position(db: Session, user_id: UUID, payload: InvestmentPositionCreateRequest) -> InvestmentPositionResponse:
    account_id = payload.financialAccountId
    account = db.scalar(select(FinancialAccount).where(
        FinancialAccount.id == account_id,
        FinancialAccount.user_id == user_id,
        FinancialAccount.archived.is_(False),
    ))
    if account is None:
        raise LookupError("Financial account not found")
    if account.account_type != "broker":
        raise ValueError("Investment positions can only be attached to broker accounts")
    duplicate = db.scalar(select(InvestmentPosition.id).where(
        InvestmentPosition.user_id == user_id,
        InvestmentPosition.financial_account_id == account_id,
        InvestmentPosition.isin == payload.isin,
        InvestmentPosition.archived.is_(False),
    ))
    if duplicate is not None:
        raise ValueError("This ISIN already exists in the selected portfolio")
    now = datetime.now(timezone.utc)
    position = InvestmentPosition(
        user_id=user_id, financial_account_id=account_id, name=payload.name.strip(),
        isin=payload.isin, units=payload.units.quantize(UNITS_PRECISION),
        cost_total=payload.costTotal.quantize(MONEY_CENT), currency="EUR", archived=False,
    )
    if not position.name:
        raise ValueError("name cannot be empty")
    db.add(position)
    db.flush()
    db.add(InvestmentPositionMovement(
        position_id=position.id, user_id=user_id, movement_type="initial",
        units_after=position.units, cost_total_after=position.cost_total,
        occurred_at=now, note="Initial holdings",
    ))
    _revalue_account(db, user_id, account_id, now)
    db.commit()
    db.refresh(position)
    return _position_response(db, position)

def update_position_holdings(
    db: Session, user_id: UUID, position_id: UUID, payload: InvestmentHoldingsUpdateRequest,
) -> InvestmentPositionResponse | None:
    position = db.scalar(select(InvestmentPosition).where(
        InvestmentPosition.id == position_id,
        InvestmentPosition.user_id == user_id,
        InvestmentPosition.archived.is_(False),
    ).with_for_update())
    if position is None:
        return None
    occurred_at = payload.occurredAt or datetime.now(timezone.utc)
    position.units = payload.units.quantize(UNITS_PRECISION)
    position.cost_total = payload.costTotal.quantize(MONEY_CENT)
    note = payload.note.strip() if payload.note else None
    db.add(InvestmentPositionMovement(
        position_id=position.id, user_id=user_id, movement_type=payload.movementType,
        units_after=position.units, cost_total_after=position.cost_total,
        occurred_at=occurred_at, note=note or None,
    ))
    _revalue_account(db, user_id, position.financial_account_id, occurred_at)
    db.commit()
    db.refresh(position)
    return _position_response(db, position)

def archive_position(db: Session, user_id: UUID, position_id: UUID) -> bool:
    position = db.scalar(select(InvestmentPosition).where(
        InvestmentPosition.id == position_id,
        InvestmentPosition.user_id == user_id,
        InvestmentPosition.archived.is_(False),
    ).with_for_update())
    if position is None:
        return False
    account_id = position.financial_account_id
    position.archived = True
    db.flush()
    _revalue_account(db, user_id, account_id)
    db.commit()
    return True

def list_position_movements(db: Session, user_id: UUID, position_id: UUID) -> list[InvestmentMovementResponse] | None:
    exists = db.scalar(select(InvestmentPosition.id).where(
        InvestmentPosition.id == position_id, InvestmentPosition.user_id == user_id))
    if exists is None:
        return None
    rows = db.scalars(select(InvestmentPositionMovement).where(
        InvestmentPositionMovement.position_id == position_id,
        InvestmentPositionMovement.user_id == user_id,
    ).order_by(InvestmentPositionMovement.occurred_at.desc())).all()
    return [InvestmentMovementResponse(
        id=str(row.id), positionId=str(row.position_id), movementType=row.movement_type,
        unitsAfter=_units(row.units_after), costTotalAfter=_money(row.cost_total_after),
        occurredAt=row.occurred_at, note=row.note,
    ) for row in rows]

def list_portfolios(db: Session, user_id: UUID) -> list[InvestmentPortfolioResponse]:
    accounts = db.scalars(select(FinancialAccount).where(
        FinancialAccount.user_id == user_id,
        FinancialAccount.account_type == "broker",
        FinancialAccount.archived.is_(False),
    ).order_by(FinancialAccount.created_at.asc())).all()
    response: list[InvestmentPortfolioResponse] = []
    for account in accounts:
        rows = _active_positions(db, user_id, account.id)
        if not rows:
            continue
        positions = [_position_response(db, p) for p in rows]
        total_value = sum((Decimal(p.currentValue) for p in positions), ZERO)
        total_cost = sum((Decimal(p.costTotal) for p in positions), ZERO)
        gain = total_value - total_cost
        dates = [p.navDate for p in positions if p.navDate is not None]
        response.append(InvestmentPortfolioResponse(
            financialAccountId=str(account.id), name=account.name, institution=account.institution,
            totalValue=_money(total_value), totalCost=_money(total_cost), gainAmount=_money(gain),
            gainPercent=None if total_cost == ZERO else _percent((gain / total_cost) * Decimal("100")),
            latestValuationDate=max(dates) if dates else None, positions=positions,
        ))
    return response

def _store_quote(db: Session, quote) -> FundNavQuote:
    existing = db.scalar(select(FundNavQuote).where(
        FundNavQuote.isin == quote.isin,
        FundNavQuote.valuation_date == quote.valuation_date,
    ).with_for_update())
    now = datetime.now(timezone.utc)
    if existing is None:
        existing = FundNavQuote(
            isin=quote.isin, nav=quote.nav.quantize(NAV_PRECISION), currency=quote.currency,
            valuation_date=quote.valuation_date, provider=quote.provider,
            source_url=quote.source_url, fetched_at=now,
        )
        db.add(existing)
    else:
        existing.nav = quote.nav.quantize(NAV_PRECISION)
        existing.provider = quote.provider
        existing.source_url = quote.source_url
        existing.fetched_at = now
    db.flush()
    return existing

def refresh_user_navs(db: Session, user_id: UUID, force: bool = False) -> NavRefreshResponse:
    positions = list(db.scalars(select(InvestmentPosition).where(
        InvestmentPosition.user_id == user_id,
        InvestmentPosition.archived.is_(False),
    )).all())
    stale_before = datetime.now(timezone.utc) - timedelta(hours=12)
    results: list[NavRefreshResult] = []
    for isin in sorted({p.isin for p in positions}):
        latest = _latest_quote(db, isin)
        if not force and latest is not None and latest.fetched_at >= stale_before:
            results.append(NavRefreshResult(
                isin=isin, status="cached", nav=_nav(latest.nav),
                valuationDate=latest.valuation_date, provider=latest.provider))
            continue
        if not is_auto_priced(isin):
            results.append(NavRefreshResult(isin=isin, status="unsupported",
                message="No automatic public NAV provider is configured for this ISIN yet"))
            continue
        try:
            quote = fetch_public_nav(isin)
            if quote is None:
                results.append(NavRefreshResult(isin=isin, status="unsupported"))
                continue
            stored = _store_quote(db, quote)
            results.append(NavRefreshResult(
                isin=isin, status="updated", nav=_nav(stored.nav),
                valuationDate=stored.valuation_date, provider=stored.provider))
        except Exception as exc:
            results.append(NavRefreshResult(isin=isin, status="failed", message=str(exc)[:240]))
    changed = 0
    for account_id in sorted({p.financial_account_id for p in positions}, key=str):
        if _revalue_account(db, user_id, account_id):
            changed += 1
    db.commit()
    return NavRefreshResponse(results=results, refreshedAccounts=changed)

def get_portfolio_history(
    db: Session, user_id: UUID, account_id: UUID, range_name: str,
) -> InvestmentPortfolioHistoryResponse | None:
    account = db.scalar(select(FinancialAccount.id).where(
        FinancialAccount.id == account_id,
        FinancialAccount.user_id == user_id,
        FinancialAccount.account_type == "broker",
    ))
    if account is None:
        return None
    today = datetime.now(timezone.utc).date()
    starts = {"1m": today - timedelta(days=31), "3m": today - timedelta(days=93), "1y": today - timedelta(days=366), "all": None}
    if range_name not in starts:
        raise ValueError("invalid range")
    positions = _active_positions(db, user_id, account_id)
    if not positions:
        return InvestmentPortfolioHistoryResponse(financialAccountId=str(account_id), range=range_name, points=[])
    position_ids = [p.id for p in positions]
    isins = sorted({p.isin for p in positions})
    quote_query = select(FundNavQuote).where(FundNavQuote.isin.in_(isins))
    if starts[range_name] is not None:
        quote_query = quote_query.where(FundNavQuote.valuation_date >= starts[range_name])
    quotes = list(db.scalars(quote_query.order_by(FundNavQuote.valuation_date.asc())).all())
    movements = list(db.scalars(select(InvestmentPositionMovement).where(
        InvestmentPositionMovement.user_id == user_id,
        InvestmentPositionMovement.position_id.in_(position_ids),
    ).order_by(InvestmentPositionMovement.occurred_at.asc())).all())
    by_position = {p.id: [] for p in positions}
    for movement in movements:
        by_position.setdefault(movement.position_id, []).append(movement)
    by_isin = {isin: [] for isin in isins}
    for quote in quotes:
        by_isin.setdefault(quote.isin, []).append(quote)
    points: list[InvestmentHistoryPoint] = []
    for day in sorted({q.valuation_date for q in quotes}):
        end = datetime.combine(day, time.max, tzinfo=timezone.utc)
        total_value = ZERO
        total_cost = ZERO
        has_value = False
        for position in positions:
            movement = next((m for m in reversed(by_position.get(position.id, [])) if m.occurred_at <= end), None)
            if movement is None:
                continue
            quote = next((q for q in reversed(by_isin.get(position.isin, [])) if q.valuation_date <= day), None)
            cost = Decimal(movement.cost_total_after)
            total_cost += cost
            total_value += cost if quote is None else Decimal(movement.units_after) * Decimal(quote.nav)
            has_value = True
        if has_value:
            points.append(InvestmentHistoryPoint(date=day, value=_money(total_value), cost=_money(total_cost)))
    return InvestmentPortfolioHistoryResponse(
        financialAccountId=str(account_id), range=range_name, points=points)
