from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.financial_account import FinancialAccount, FinancialAccountBalanceSnapshot
from app.models.sync import SyncChange
from app.sync_schemas import (
    FinancialAccountBalanceObservationSyncPayload,
    FinancialAccountSyncPayload,
    SyncMutationRequest,
    SyncPushRequest,
    SyncPushResponse,
)
from app.services.sync_service import push_sync


MONEY_CENT = Decimal("0.01")


def _money(value: Decimal | str) -> str:
    return f"{Decimal(value).quantize(MONEY_CENT):.2f}"


def _snapshot_change_payload(
    account_id: UUID,
    observation: FinancialAccountBalanceObservationSyncPayload,
) -> dict[str, object]:
    return {
        "financialAccountId": str(account_id),
        "balance": _money(observation.balance),
        "includeInNetWorth": observation.includeInNetWorth,
        "archived": observation.archived,
        "recordedAt": observation.recordedAt.isoformat(),
        "source": observation.source,
    }


def _latest_snapshot_change(
    db: Session,
    user_id: UUID,
    snapshot_id: UUID,
) -> SyncChange | None:
    return db.scalar(
        select(SyncChange)
        .where(
            SyncChange.scope_user_id == user_id,
            SyncChange.entity_type == "financial_account_snapshot",
            SyncChange.entity_id == snapshot_id,
        )
        .order_by(SyncChange.sequence.desc())
        .limit(1)
    )


def _reconcile_observation(
    db: Session,
    user_id: UUID,
    account: FinancialAccount,
    observation: FinancialAccountBalanceObservationSyncPayload,
) -> None:
    snapshot = db.scalar(
        select(FinancialAccountBalanceSnapshot)
        .where(FinancialAccountBalanceSnapshot.id == observation.id)
        .with_for_update()
    )
    exact_balance = Decimal(observation.balance).quantize(MONEY_CENT)

    if snapshot is None:
        db.add(
            FinancialAccountBalanceSnapshot(
                id=observation.id,
                financial_account_id=account.id,
                user_id=user_id,
                balance=exact_balance,
                include_in_net_worth=observation.includeInNetWorth,
                archived=observation.archived,
                recorded_at=observation.recordedAt,
                source=observation.source,
            )
        )
        db.flush()
        return

    if snapshot.user_id != user_id or snapshot.financial_account_id != account.id:
        raise ValueError("financial-account observation id is already owned by another snapshot")

    snapshot.balance = exact_balance
    snapshot.include_in_net_worth = observation.includeInNetWorth
    snapshot.archived = observation.archived
    snapshot.recorded_at = observation.recordedAt
    snapshot.source = observation.source
    db.flush()

    change = _latest_snapshot_change(db, user_id, observation.id)
    if change is None:
        raise ValueError("financial-account snapshot is missing its sync change")
    change.payload_json = _snapshot_change_payload(account.id, observation)
    change.changed_at = observation.recordedAt


def _reconcile_mutation_history(
    db: Session,
    user_id: UUID,
    mutation: SyncMutationRequest,
) -> None:
    if mutation.entityType != "financial_account" or mutation.operation != "upsert":
        return

    payload = FinancialAccountSyncPayload.model_validate(mutation.payload)
    if not payload.balanceObservations:
        return

    account = db.scalar(
        select(FinancialAccount).where(
            FinancialAccount.id == mutation.entityId,
            FinancialAccount.user_id == user_id,
        )
    )
    if account is None:
        raise ValueError("applied financial-account mutation is missing its account")

    for observation in payload.balanceObservations:
        _reconcile_observation(db, user_id, account, observation)


def push_sync_preserving_financial_account_history(
    db: Session,
    user_id: UUID,
    payload: SyncPushRequest,
) -> SyncPushResponse:
    """Apply sync-v1 and durably replay every coalesced offline account observation.

    The core sync service remains authoritative for optimistic concurrency and final account state.
    It commits each mutation before returning. History reconciliation is intentionally idempotent:
    if reconciliation fails after the final account mutation was committed, the HTTP request fails,
    the client retries the same mutation, core sync returns it as duplicate, and reconciliation can
    safely complete without duplicating snapshot ids.
    """

    response = push_sync(db, user_id, payload)
    result_by_mutation = {result.mutationId: result for result in response.results}

    try:
        for mutation in payload.mutations:
            result = result_by_mutation.get(mutation.mutationId)
            if result is None or result.status not in {"applied", "duplicate"}:
                continue
            _reconcile_mutation_history(db, user_id, mutation)
        db.commit()
    except Exception:
        db.rollback()
        raise

    return response
