from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.financial_account_schemas import (
    FinancialAccountBalanceSnapshotResponse,
    FinancialAccountCreateRequest,
    FinancialAccountResponse,
    FinancialAccountUpdateRequest,
    NetWorthHistoryPoint,
    NetWorthHistoryResponse,
    NetWorthSummaryResponse,
)
from app.models.financial_account import FinancialAccount, FinancialAccountBalanceSnapshot


MONEY_CENT = Decimal("0.01")
ZERO = Decimal("0.00")


def _money(value: Decimal | int | str) -> str:
    return format(Decimal(value).quantize(MONEY_CENT), "f")


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
        recordedAt=snapshot.recorded_at,
        source=snapshot.source,
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
    db.add(
        FinancialAccountBalanceSnapshot(
            financial_account_id=account.id,
            user_id=user_id,
            balance=account.current_balance,
            recorded_at=now,
            source="manual",
        )
    )
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

    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        account.name = _clean_required(changes["name"], "name")
    if "institution" in changes:
        account.institution = _clean_optional(changes["institution"])
    if "accountType" in changes:
        account.account_type = changes["accountType"]
    if "purpose" in changes:
        account.purpose = changes["purpose"]
    if "includeInNetWorth" in changes:
        account.include_in_net_worth = changes["includeInNetWorth"]
    if "archived" in changes:
        account.archived = changes["archived"]

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
        .where(FinancialAccount.id == account_id, FinancialAccount.user_id == user_id)
        .with_for_update()
    )
    if account is None:
        return None

    now = datetime.now(timezone.utc)
    exact_balance = balance.quantize(MONEY_CENT)
    account.current_balance = exact_balance
    account.balance_updated_at = now
    snapshot = FinancialAccountBalanceSnapshot(
        financial_account_id=account.id,
        user_id=user_id,
        balance=exact_balance,
        recorded_at=now,
        source="manual",
    )
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


def get_net_worth_history(db: Session, user_id: UUID, months: int) -> NetWorthHistoryResponse:
    accounts = db.scalars(
        select(FinancialAccount).where(
            FinancialAccount.user_id == user_id,
            FinancialAccount.archived.is_(False),
            FinancialAccount.include_in_net_worth.is_(True),
        )
    ).all()
    account_ids = [account.id for account in accounts]
    if not account_ids:
        return NetWorthHistoryResponse(
            months=months,
            points=[],
            changeAmount="0.00",
            changePercent=None,
            currency="EUR",
        )

    snapshots = db.scalars(
        select(FinancialAccountBalanceSnapshot)
        .where(
            FinancialAccountBalanceSnapshot.user_id == user_id,
            FinancialAccountBalanceSnapshot.financial_account_id.in_(account_ids),
        )
        .order_by(
            FinancialAccountBalanceSnapshot.recorded_at.asc(),
            FinancialAccountBalanceSnapshot.id.asc(),
        )
    ).all()

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=31 * months)
    balances: dict[UUID, Decimal] = {}
    points: list[NetWorthHistoryPoint] = []
    baseline_total: Decimal | None = None

    for snapshot in snapshots:
        balances[snapshot.financial_account_id] = Decimal(snapshot.balance)
        current_total = sum(balances.values(), ZERO)
        if snapshot.recorded_at < cutoff:
            baseline_total = current_total
            continue
        if baseline_total is not None and not points:
            points.append(NetWorthHistoryPoint(recordedAt=cutoff, totalNetWorth=_money(baseline_total)))
        points.append(
            NetWorthHistoryPoint(
                recordedAt=snapshot.recorded_at,
                totalNetWorth=_money(current_total),
            )
        )

    current_total = sum((Decimal(account.current_balance) for account in accounts), ZERO)
    if baseline_total is not None and not points:
        points.append(NetWorthHistoryPoint(recordedAt=cutoff, totalNetWorth=_money(baseline_total)))
    if not points or points[-1].totalNetWorth != _money(current_total):
        points.append(NetWorthHistoryPoint(recordedAt=now, totalNetWorth=_money(current_total)))

    first = Decimal(points[0].totalNetWorth) if points else ZERO
    last = Decimal(points[-1].totalNetWorth) if points else ZERO
    change = last - first
    change_percent = None if first == ZERO else _money((change / abs(first)) * Decimal("100"))

    return NetWorthHistoryResponse(
        months=months,
        points=points,
        changeAmount=_money(change),
        changePercent=change_percent,
        currency="EUR",
    )
