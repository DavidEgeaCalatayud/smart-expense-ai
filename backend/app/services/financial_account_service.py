from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.financial_account_schemas import (
    FinancialAccountBalanceSnapshotResponse,
    FinancialAccountCreateRequest,
    FinancialAccountRankItem,
    FinancialAccountResponse,
    FinancialAccountsSummaryResponse,
    FinancialAccountUpdateRequest,
    NetWorthHistoryPoint,
    NetWorthHistoryResponse,
    NetWorthSummaryResponse,
)
from app.models.financial_account import FinancialAccount, FinancialAccountBalanceSnapshot


MONEY_CENT = Decimal("0.01")
PERCENT_CENT = Decimal("0.01")
ZERO = Decimal("0.00")


def _money(value: Decimal | int | str) -> str:
    return format(Decimal(value).quantize(MONEY_CENT), "f")


def _percent(value: Decimal) -> str:
    return format(value.quantize(PERCENT_CENT, rounding=ROUND_HALF_UP), "f")


def _clean_required(value: str, field_name: str) -> str:
    clean = value.strip()
    if not clean:
        raise ValueError(f"{field_name} cannot be empty")
    return clean


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    clean = value.strip()
    return clean or None


def _account_response(account: FinancialAccount) -> FinancialAccountResponse:
    return FinancialAccountResponse(
        id=str(account.id),
        name=account.name,
        institution=account.institution,
        accountType=account.account_type,
        purpose=account.purpose,
        currentBalance=_money(account.current_balance),
        currency=account.currency,
        includeInNetWorth=account.include_in_net_worth,
        archived=account.archived,
        balanceUpdatedAt=account.balance_updated_at,
        createdAt=account.created_at,
        updatedAt=account.updated_at,
    )


def _snapshot_response(snapshot: FinancialAccountBalanceSnapshot) -> FinancialAccountBalanceSnapshotResponse:
    return FinancialAccountBalanceSnapshotResponse(
        id=str(snapshot.id),
        financialAccountId=str(snapshot.financial_account_id),
        balance=_money(snapshot.balance),
        includeInNetWorth=snapshot.include_in_net_worth,
        archived=snapshot.archived,
        recordedAt=snapshot.recorded_at,
        source=snapshot.source,
    )


def _new_snapshot(
    *,
    account: FinancialAccount,
    user_id: UUID,
    recorded_at: datetime,
    source: str = "manual",
) -> FinancialAccountBalanceSnapshot:
    return FinancialAccountBalanceSnapshot(
        financial_account_id=account.id,
        user_id=user_id,
        balance=account.current_balance,
        include_in_net_worth=account.include_in_net_worth,
        archived=account.archived,
        recorded_at=recorded_at,
        source=source,
    )


def list_financial_accounts(
    db: Session,
    user_id: UUID,
    *,
    include_archived: bool = False,
) -> list[FinancialAccountResponse]:
    conditions = [FinancialAccount.user_id == user_id]
    if not include_archived:
        conditions.append(FinancialAccount.archived.is_(False))
    accounts = db.scalars(
        select(FinancialAccount)
        .where(*conditions)
        .order_by(FinancialAccount.archived.asc(), FinancialAccount.created_at.asc(), FinancialAccount.id.asc())
    ).all()
    return [_account_response(account) for account in accounts]


def create_financial_account(
    db: Session,
    user_id: UUID,
    payload: FinancialAccountCreateRequest,
) -> FinancialAccountResponse:
    now = datetime.now(timezone.utc)
    account = FinancialAccount(
        user_id=user_id,
        name=_clean_required(payload.name, "name"),
        institution=_clean_optional(payload.institution),
        account_type=payload.accountType,
        purpose=payload.purpose,
        current_balance=payload.currentBalance.quantize(MONEY_CENT),
        currency=payload.currency,
        include_in_net_worth=payload.includeInNetWorth,
        archived=False,
        balance_updated_at=now,
    )
    db.add(account)
    db.flush()
    db.add(_new_snapshot(account=account, user_id=user_id, recorded_at=now))
    db.commit()
    db.refresh(account)
    return _account_response(account)


def update_financial_account(
    db: Session,
    user_id: UUID,
    account_id: UUID,
    payload: FinancialAccountUpdateRequest,
) -> FinancialAccountResponse | None:
    account = db.scalar(
        select(FinancialAccount)
        .where(FinancialAccount.id == account_id, FinancialAccount.user_id == user_id)
        .with_for_update()
    )
    if account is None:
        return None

    previous_include = account.include_in_net_worth
    previous_archived = account.archived
    previous_balance = Decimal(account.current_balance).quantize(MONEY_CENT)
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        account.name = _clean_required(changes["name"], "name")
    if "institution" in changes:
        account.institution = _clean_optional(changes["institution"])
    if "accountType" in changes:
        account.account_type = changes["accountType"]
    if "purpose" in changes:
        account.purpose = changes["purpose"]
    if "currentBalance" in changes:
        account.current_balance = Decimal(changes["currentBalance"]).quantize(MONEY_CENT)
    if "includeInNetWorth" in changes:
        account.include_in_net_worth = changes["includeInNetWorth"]
    if "archived" in changes:
        account.archived = changes["archived"]

    # The account's persisted type is authoritative even when callers patch only purpose.
    # A broker can never drift into Disponible/Reservado because accountType was omitted.
    if account.account_type == "broker":
        account.purpose = "investment"

    balance_changed = previous_balance != Decimal(account.current_balance).quantize(MONEY_CENT)
    state_changed = (
        balance_changed
        or previous_include != account.include_in_net_worth
        or previous_archived != account.archived
    )
    if state_changed:
        now = datetime.now(timezone.utc)
        if balance_changed:
            account.balance_updated_at = now
        db.add(
            _new_snapshot(
                account=account,
                user_id=user_id,
                recorded_at=now,
            )
        )

    db.commit()
    db.refresh(account)
    return _account_response(account)


def archive_financial_account(db: Session, user_id: UUID, account_id: UUID) -> bool:
    account = db.scalar(
        select(FinancialAccount)
        .where(
            FinancialAccount.id == account_id,
            FinancialAccount.user_id == user_id,
            FinancialAccount.archived.is_(False),
        )
        .with_for_update()
    )
    if account is None:
        return False
    account.archived = True
    db.add(
        _new_snapshot(
            account=account,
            user_id=user_id,
            recorded_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    return True


def record_financial_account_balance(
    db: Session,
    user_id: UUID,
    account_id: UUID,
    balance: Decimal,
) -> tuple[FinancialAccountResponse, FinancialAccountBalanceSnapshotResponse] | None:
    account = db.scalar(
        select(FinancialAccount)
        .where(
            FinancialAccount.id == account_id,
            FinancialAccount.user_id == user_id,
            FinancialAccount.archived.is_(False),
        )
        .with_for_update()
    )
    if account is None:
        return None

    now = datetime.now(timezone.utc)
    exact_balance = balance.quantize(MONEY_CENT)
    account.current_balance = exact_balance
    account.balance_updated_at = now
    snapshot = _new_snapshot(account=account, user_id=user_id, recorded_at=now)
    db.add(snapshot)
    db.commit()
    db.refresh(account)
    db.refresh(snapshot)
    return _account_response(account), _snapshot_response(snapshot)


def get_net_worth_summary(db: Session, user_id: UUID) -> NetWorthSummaryResponse:
    accounts = db.scalars(
        select(FinancialAccount).where(
            FinancialAccount.user_id == user_id,
            FinancialAccount.archived.is_(False),
            FinancialAccount.include_in_net_worth.is_(True),
        )
    ).all()

    by_purpose: dict[str, Decimal] = {
        "daily": ZERO,
        "savings": ZERO,
        "emergency_fund": ZERO,
        "opportunities": ZERO,
        "investment": ZERO,
        "other": ZERO,
    }
    for account in accounts:
        by_purpose[account.purpose] += Decimal(account.current_balance)

    available = by_purpose["daily"] + by_purpose["other"]
    reserved = by_purpose["savings"] + by_purpose["emergency_fund"] + by_purpose["opportunities"]
    invested = by_purpose["investment"]
    total = available + reserved + invested
    return NetWorthSummaryResponse(
        totalNetWorth=_money(total),
        available=_money(available),
        reserved=_money(reserved),
        invested=_money(invested),
        daily=_money(by_purpose["daily"]),
        savings=_money(by_purpose["savings"]),
        emergencyFund=_money(by_purpose["emergency_fund"]),
        opportunities=_money(by_purpose["opportunities"]),
        investment=_money(by_purpose["investment"]),
        other=_money(by_purpose["other"]),
        currency="EUR",
    )


def get_financial_accounts_summary(db: Session, user_id: UUID) -> FinancialAccountsSummaryResponse:
    accounts = list(
        db.scalars(
            select(FinancialAccount).where(
                FinancialAccount.user_id == user_id,
                FinancialAccount.archived.is_(False),
                FinancialAccount.include_in_net_worth.is_(True),
            )
        ).all()
    )
    accounts.sort(key=lambda account: (Decimal(account.current_balance), account.name), reverse=True)
    total = sum((Decimal(account.current_balance) for account in accounts), ZERO)
    invested = sum(
        (Decimal(account.current_balance) for account in accounts if account.purpose == "investment"),
        ZERO,
    )
    opportunities = sum(
        (Decimal(account.current_balance) for account in accounts if account.purpose == "opportunities"),
        ZERO,
    )

    ranked = [
        FinancialAccountRankItem(
            id=str(account.id),
            name=account.name,
            institution=account.institution,
            accountType=account.account_type,
            purpose=account.purpose,
            currentBalance=_money(account.current_balance),
            sharePercent=None if total == ZERO else _percent((Decimal(account.current_balance) / total) * Decimal("100")),
        )
        for account in accounts
    ]
    return FinancialAccountsSummaryResponse(
        accountCount=len(ranked),
        totalNetWorth=_money(total),
        investedPercent=None if total == ZERO else _percent((invested / total) * Decimal("100")),
        opportunityCapital=_money(opportunities),
        largestAccount=ranked[0] if ranked else None,
        accounts=ranked,
        currency="EUR",
    )


def _state_total(
    state: dict[UUID, tuple[Decimal, bool, bool]],
) -> Decimal:
    return sum(
        (
            balance
            for balance, include_in_net_worth, archived in state.values()
            if include_in_net_worth and not archived
        ),
        ZERO,
    )


def get_net_worth_history(db: Session, user_id: UUID, months: int) -> NetWorthHistoryResponse:
    snapshots = list(
        db.scalars(
            select(FinancialAccountBalanceSnapshot)
            .where(FinancialAccountBalanceSnapshot.user_id == user_id)
            .order_by(
                FinancialAccountBalanceSnapshot.recorded_at.asc(),
                FinancialAccountBalanceSnapshot.id.asc(),
            )
        ).all()
    )
    if not snapshots:
        return NetWorthHistoryResponse(
            months=months,
            points=[],
            changeAmount="0.00",
            changePercent=None,
            currency="EUR",
        )

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=31 * months)
    state: dict[UUID, tuple[Decimal, bool, bool]] = {}
    baseline_total = ZERO
    has_baseline = False
    daily_totals: dict[date, tuple[datetime, Decimal]] = {}

    for snapshot in snapshots:
        state[snapshot.financial_account_id] = (
            Decimal(snapshot.balance),
            snapshot.include_in_net_worth,
            snapshot.archived,
        )
        current_total = _state_total(state)
        if snapshot.recorded_at < cutoff:
            baseline_total = current_total
            has_baseline = True
            continue
        day = snapshot.recorded_at.astimezone(timezone.utc).date()
        daily_totals[day] = (snapshot.recorded_at, current_total)

    points: list[NetWorthHistoryPoint] = []
    if has_baseline:
        points.append(
            NetWorthHistoryPoint(
                recordedAt=cutoff,
                totalNetWorth=_money(baseline_total),
            )
        )
    for _, (recorded_at, total) in sorted(daily_totals.items(), key=lambda item: item[0]):
        points.append(NetWorthHistoryPoint(recordedAt=recorded_at, totalNetWorth=_money(total)))

    current_total = Decimal(get_net_worth_summary(db, user_id).totalNetWorth)
    if not points:
        points.append(NetWorthHistoryPoint(recordedAt=now, totalNetWorth=_money(current_total)))
    else:
        same_day = points[-1].recordedAt.astimezone(timezone.utc).date() == now.date()
        if same_day:
            if Decimal(points[-1].totalNetWorth) != current_total:
                points[-1] = NetWorthHistoryPoint(recordedAt=now, totalNetWorth=_money(current_total))
        else:
            points.append(NetWorthHistoryPoint(recordedAt=now, totalNetWorth=_money(current_total)))

    first = Decimal(points[0].totalNetWorth)
    last = Decimal(points[-1].totalNetWorth)
    change = last - first
    change_percent = None if first == ZERO else _money((change / abs(first)) * Decimal("100"))

    return NetWorthHistoryResponse(
        months=months,
        points=points,
        changeAmount=_money(change),
        changePercent=change_percent,
        currency="EUR",
    )
