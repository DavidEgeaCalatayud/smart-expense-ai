from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from pydantic import ValidationError
from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.budget import Budget
from app.models.category import Category
from app.models.sync import SyncChange, SyncDevice, SyncMutation
from app.models.transaction import Transaction
from app.sync_schemas import (
    BudgetSyncPayload,
    CategorySyncPayload,
    SyncBootstrapPage,
    SyncChangeResponse,
    SyncConflictResponse,
    SyncMutationError,
    SyncMutationRequest,
    SyncMutationResult,
    SyncPullPage,
    SyncPushRequest,
    SyncPushResponse,
    TransactionSyncPayload,
)
from app.services.sync_cursor import (
    BootstrapPhase,
    decode_cursor,
    decode_page_token,
    decode_snapshot_token,
    encode_cursor,
    encode_page_token,
    encode_snapshot_token,
)


MONEY_CENT = Decimal("0.01")
BOOTSTRAP_PHASES: tuple[BootstrapPhase, ...] = ("category", "transaction", "budget")


@dataclass(frozen=True)
class _MutationOutcome:
    result: SyncMutationResult
    conflict: SyncConflictResponse | None = None


def _money(value: Decimal) -> str:
    return f"{Decimal(value).quantize(MONEY_CENT):.2f}"


def _transaction_payload(transaction: Transaction) -> dict[str, Any]:
    return {
        "merchant": transaction.merchant,
        "description": transaction.description,
        "categoryId": str(transaction.category_id),
        "amount": _money(transaction.amount),
        "currency": transaction.currency,
        "transactionDate": transaction.transaction_date.isoformat(),
        "transactionType": transaction.transaction_type,
        "paymentMethod": transaction.payment_method,
        "isRecurring": transaction.is_recurring,
        "source": transaction.source,
    }


def _category_payload(category: Category) -> dict[str, Any]:
    return {
        "name": category.name,
        "transactionType": category.transaction_type,
        "systemCategory": category.system_category,
        "archived": category.archived,
    }


def _budget_payload(budget: Budget) -> dict[str, Any]:
    return {
        "categoryId": None if budget.category_id is None else str(budget.category_id),
        "month": budget.month.isoformat(),
        "limitAmount": _money(budget.limit_amount),
    }


def _result(
    mutation: SyncMutationRequest,
    status: str,
    *,
    server_version: int | None = None,
    code: str | None = None,
    message: str | None = None,
) -> SyncMutationResult:
    error = None
    if code is not None and message is not None:
        error = SyncMutationError(code=code, message=message)
    return SyncMutationResult(
        mutationId=mutation.mutationId,
        entityType=mutation.entityType,
        entityId=mutation.entityId,
        status=status,
        serverVersion=server_version,
        error=error,
    )


def _conflict(
    mutation: SyncMutationRequest,
    reason: str,
    *,
    server_version: int | None,
    server_payload: dict[str, Any] | None,
) -> _MutationOutcome:
    return _MutationOutcome(
        result=_result(
            mutation,
            "conflict",
            server_version=server_version,
            code=reason,
            message="The server state changed since this device last observed the entity.",
        ),
        conflict=SyncConflictResponse(
            mutationId=mutation.mutationId,
            entityType=mutation.entityType,
            entityId=mutation.entityId,
            reason=reason,
            serverVersion=server_version,
            serverPayload=server_payload,
        ),
    )


def _rejected(mutation: SyncMutationRequest, code: str, message: str) -> _MutationOutcome:
    return _MutationOutcome(result=_result(mutation, "rejected", code=code, message=message))


def _request_hash(mutation: SyncMutationRequest) -> str:
    canonical = json.dumps(
        mutation.model_dump(mode="json", exclude_none=False),
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _advisory_lock_key(user_id: UUID, device_id: UUID, mutation_id: UUID) -> int:
    digest = hashlib.sha256(f"{user_id}:{device_id}:{mutation_id}".encode("ascii")).digest()
    return int.from_bytes(digest[:8], byteorder="big", signed=True)


def _register_device(db: Session, user_id: UUID, device_id: UUID) -> None:
    statement = (
        pg_insert(SyncDevice)
        .values(id=uuid4(), user_id=user_id, device_id=device_id)
        .on_conflict_do_update(
            constraint="uq_sync_devices_user_device",
            set_={"last_seen_at": func.now()},
        )
    )
    db.execute(statement)
    db.commit()


def _stored_outcome(record: SyncMutation, mutation: SyncMutationRequest) -> _MutationOutcome:
    stored_result = SyncMutationResult.model_validate(record.result_json["result"])
    stored_conflict_raw = record.result_json.get("conflict")
    stored_conflict = (
        None
        if stored_conflict_raw is None
        else SyncConflictResponse.model_validate(stored_conflict_raw)
    )
    if stored_result.status == "applied":
        stored_result = stored_result.model_copy(update={"status": "duplicate"})
    return _MutationOutcome(result=stored_result, conflict=stored_conflict)


def _persist_outcome(
    db: Session,
    user_id: UUID,
    device_id: UUID,
    mutation: SyncMutationRequest,
    request_hash: str,
    outcome: _MutationOutcome,
) -> None:
    db.add(
        SyncMutation(
            user_id=user_id,
            device_id=device_id,
            mutation_id=mutation.mutationId,
            entity_type=mutation.entityType,
            entity_id=mutation.entityId,
            request_hash=request_hash,
            result_json={
                "result": outcome.result.model_dump(mode="json", exclude_none=True),
                "conflict": (
                    None
                    if outcome.conflict is None
                    else outcome.conflict.model_dump(mode="json")
                ),
            },
        )
    )
    db.commit()


def _last_user_change(
    db: Session,
    user_id: UUID,
    mutation: SyncMutationRequest,
) -> SyncChange | None:
    return db.scalar(
        select(SyncChange)
        .where(
            SyncChange.scope_user_id == user_id,
            SyncChange.entity_type == mutation.entityType,
            SyncChange.entity_id == mutation.entityId,
        )
        .order_by(SyncChange.sequence.desc())
        .limit(1)
    )


def _missing_entity_conflict(
    db: Session,
    user_id: UUID,
    mutation: SyncMutationRequest,
) -> _MutationOutcome:
    last_change = _last_user_change(db, user_id, mutation)
    if last_change is not None and last_change.operation == "delete":
        return _conflict(
            mutation,
            "server_deleted",
            server_version=last_change.entity_version,
            server_payload=None,
        )
    return _conflict(
        mutation,
        "ownership_or_visibility_changed",
        server_version=None,
        server_payload=None,
    )


def _visible_category(
    db: Session,
    user_id: UUID,
    category_id: UUID,
    *,
    include_archived: bool = False,
) -> Category | None:
    conditions = [
        Category.id == category_id,
        or_(Category.system_category.is_(True), Category.owner_user_id == user_id),
    ]
    if not include_archived:
        conditions.append(Category.archived.is_(False))
    return db.scalar(select(Category).where(*conditions))


def _validate_transaction_category(
    db: Session,
    user_id: UUID,
    payload: TransactionSyncPayload,
) -> Category | None:
    category = _visible_category(db, user_id, payload.categoryId)
    if category is None or category.transaction_type != payload.transactionType:
        return None
    return category


def _apply_transaction_mutation(
    db: Session,
    user_id: UUID,
    mutation: SyncMutationRequest,
) -> _MutationOutcome:
    existing = db.scalar(
        select(Transaction).where(Transaction.id == mutation.entityId).with_for_update()
    )

    if mutation.operation == "delete":
        if existing is None or existing.user_id != user_id:
            return _missing_entity_conflict(db, user_id, mutation)
        if mutation.baseVersion != existing.sync_version:
            return _conflict(
                mutation,
                "stale_version",
                server_version=existing.sync_version,
                server_payload=_transaction_payload(existing),
            )
        deleted_version = existing.sync_version + 1
        db.delete(existing)
        db.flush()
        return _MutationOutcome(
            result=_result(mutation, "applied", server_version=deleted_version)
        )

    try:
        payload = TransactionSyncPayload.model_validate(mutation.payload)
    except ValidationError as exc:
        return _rejected(mutation, "invalid_transaction", str(exc))

    if payload.currency != "EUR":
        return _rejected(
            mutation,
            "unsupported_currency",
            "Only EUR is supported until the multi-currency contract is implemented.",
        )
    category = _validate_transaction_category(db, user_id, payload)
    if category is None:
        return _rejected(
            mutation,
            "invalid_category",
            "Category is unavailable, archived, or incompatible with the transaction type.",
        )

    if existing is None:
        if mutation.baseVersion is not None:
            return _missing_entity_conflict(db, user_id, mutation)
        if payload.source != "manual":
            return _rejected(
                mutation,
                "invalid_source",
                "Offline-created transactions must use source=manual.",
            )
        transaction = Transaction(
            id=mutation.entityId,
            user_id=user_id,
            category_id=category.id,
            merchant=payload.merchant,
            description=payload.description,
            amount=Decimal(payload.amount),
            currency=payload.currency,
            transaction_date=date.fromisoformat(payload.transactionDate),
            transaction_type=payload.transactionType,
            payment_method=payload.paymentMethod,
            is_recurring=payload.isRecurring,
            source=payload.source,
        )
        db.add(transaction)
        db.flush()
        db.refresh(transaction, attribute_names=["sync_version"])
        return _MutationOutcome(
            result=_result(mutation, "applied", server_version=transaction.sync_version)
        )

    if existing.user_id != user_id:
        return _conflict(
            mutation,
            "ownership_or_visibility_changed",
            server_version=None,
            server_payload=None,
        )
    if mutation.baseVersion != existing.sync_version:
        return _conflict(
            mutation,
            "stale_version",
            server_version=existing.sync_version,
            server_payload=_transaction_payload(existing),
        )
    if payload.source != existing.source:
        return _rejected(
            mutation,
            "source_immutable",
            "Transaction source provenance cannot be changed by synchronization.",
        )

    existing.category_id = category.id
    existing.merchant = payload.merchant
    existing.description = payload.description
    existing.amount = Decimal(payload.amount)
    existing.currency = payload.currency
    existing.transaction_date = date.fromisoformat(payload.transactionDate)
    existing.transaction_type = payload.transactionType
    existing.payment_method = payload.paymentMethod
    existing.is_recurring = payload.isRecurring
    db.flush()
    db.refresh(existing, attribute_names=["sync_version"])
    return _MutationOutcome(
        result=_result(mutation, "applied", server_version=existing.sync_version)
    )


def _category_usage_count(db: Session, user_id: UUID, category_id: UUID) -> int:
    return int(
        db.scalar(
            select(func.count(Transaction.id)).where(
                Transaction.user_id == user_id,
                Transaction.category_id == category_id,
            )
        )
        or 0
    )


def _category_name_conflict(
    db: Session,
    user_id: UUID,
    entity_id: UUID,
    payload: CategorySyncPayload,
) -> bool:
    conflict_id = db.scalar(
        select(Category.id)
        .where(
            Category.id != entity_id,
            Category.archived.is_(False),
            Category.transaction_type == payload.transactionType,
            func.lower(Category.name) == payload.name.strip().lower(),
            or_(Category.system_category.is_(True), Category.owner_user_id == user_id),
        )
        .limit(1)
    )
    return conflict_id is not None


def _apply_category_mutation(
    db: Session,
    user_id: UUID,
    mutation: SyncMutationRequest,
) -> _MutationOutcome:
    existing = db.scalar(select(Category).where(Category.id == mutation.entityId).with_for_update())

    if existing is not None and existing.system_category:
        return _rejected(
            mutation,
            "system_category_read_only",
            "System categories are globally managed and cannot be mutated by a client.",
        )

    if mutation.operation == "delete":
        if existing is None or existing.owner_user_id != user_id:
            return _missing_entity_conflict(db, user_id, mutation)
        if mutation.baseVersion != existing.sync_version:
            return _conflict(
                mutation,
                "stale_version",
                server_version=existing.sync_version,
                server_payload=_category_payload(existing),
            )
        if _category_usage_count(db, user_id, existing.id) > 0:
            return _rejected(
                mutation,
                "category_in_use",
                "A category with transactions cannot be deleted by sync; archive/reassign it first.",
            )
        deleted_version = existing.sync_version + 1
        db.delete(existing)
        db.flush()
        return _MutationOutcome(
            result=_result(mutation, "applied", server_version=deleted_version)
        )

    try:
        payload = CategorySyncPayload.model_validate(mutation.payload)
    except ValidationError as exc:
        return _rejected(mutation, "invalid_category", str(exc))

    payload.name = payload.name.strip()
    if payload.systemCategory:
        return _rejected(
            mutation,
            "system_category_read_only",
            "Mobile clients may create only account-owned categories.",
        )
    if _category_name_conflict(db, user_id, mutation.entityId, payload):
        return _rejected(
            mutation,
            "category_name_conflict",
            "An active visible category with the same name and type already exists.",
        )

    if existing is None:
        if mutation.baseVersion is not None:
            return _missing_entity_conflict(db, user_id, mutation)
        category = Category(
            id=mutation.entityId,
            owner_user_id=user_id,
            name=payload.name,
            transaction_type=payload.transactionType,
            system_category=False,
            archived=payload.archived,
        )
        db.add(category)
        db.flush()
        db.refresh(category, attribute_names=["sync_version"])
        return _MutationOutcome(
            result=_result(mutation, "applied", server_version=category.sync_version)
        )

    if existing.owner_user_id != user_id:
        return _conflict(
            mutation,
            "ownership_or_visibility_changed",
            server_version=None,
            server_payload=None,
        )
    if mutation.baseVersion != existing.sync_version:
        return _conflict(
            mutation,
            "stale_version",
            server_version=existing.sync_version,
            server_payload=_category_payload(existing),
        )

    usage_count = _category_usage_count(db, user_id, existing.id)
    if usage_count and payload.transactionType != existing.transaction_type:
        return _rejected(
            mutation,
            "category_type_in_use",
            "Category type cannot change while transactions reference it.",
        )
    if usage_count and payload.archived and not existing.archived:
        return _rejected(
            mutation,
            "category_reassignment_required",
            "Archiving a category in use requires an explicit reassignment workflow.",
        )

    existing.name = payload.name
    existing.transaction_type = payload.transactionType
    existing.archived = payload.archived
    db.flush()
    db.refresh(existing, attribute_names=["sync_version"])
    return _MutationOutcome(
        result=_result(mutation, "applied", server_version=existing.sync_version)
    )


def _budget_scope_conflict(
    db: Session,
    user_id: UUID,
    entity_id: UUID,
    month: date,
    category_id: UUID | None,
) -> bool:
    statement = select(Budget.id).where(
        Budget.user_id == user_id,
        Budget.id != entity_id,
        Budget.month == month,
    )
    statement = (
        statement.where(Budget.category_id.is_(None))
        if category_id is None
        else statement.where(Budget.category_id == category_id)
    )
    return db.scalar(statement.limit(1)) is not None


def _apply_budget_mutation(
    db: Session,
    user_id: UUID,
    mutation: SyncMutationRequest,
) -> _MutationOutcome:
    existing = db.scalar(select(Budget).where(Budget.id == mutation.entityId).with_for_update())

    if mutation.operation == "delete":
        if existing is None or existing.user_id != user_id:
            return _missing_entity_conflict(db, user_id, mutation)
        if mutation.baseVersion != existing.sync_version:
            return _conflict(
                mutation,
                "stale_version",
                server_version=existing.sync_version,
                server_payload=_budget_payload(existing),
            )
        deleted_version = existing.sync_version + 1
        db.delete(existing)
        db.flush()
        return _MutationOutcome(
            result=_result(mutation, "applied", server_version=deleted_version)
        )

    try:
        payload = BudgetSyncPayload.model_validate(mutation.payload)
    except ValidationError as exc:
        return _rejected(mutation, "invalid_budget", str(exc))

    month = date.fromisoformat(payload.month)
    category = None
    if payload.categoryId is not None:
        category = _visible_category(db, user_id, payload.categoryId)
        if category is None or category.transaction_type != "expense":
            return _rejected(
                mutation,
                "invalid_budget_category",
                "Budget category must be an active visible expense category.",
            )
    if _budget_scope_conflict(db, user_id, mutation.entityId, month, payload.categoryId):
        return _rejected(
            mutation,
            "budget_scope_conflict",
            "A budget already exists for this month and category scope.",
        )

    if existing is None:
        if mutation.baseVersion is not None:
            return _missing_entity_conflict(db, user_id, mutation)
        budget = Budget(
            id=mutation.entityId,
            user_id=user_id,
            category_id=None if category is None else category.id,
            month=month,
            limit_amount=Decimal(payload.limitAmount),
        )
        db.add(budget)
        db.flush()
        db.refresh(budget, attribute_names=["sync_version"])
        return _MutationOutcome(
            result=_result(mutation, "applied", server_version=budget.sync_version)
        )

    if existing.user_id != user_id:
        return _conflict(
            mutation,
            "ownership_or_visibility_changed",
            server_version=None,
            server_payload=None,
        )
    if mutation.baseVersion != existing.sync_version:
        return _conflict(
            mutation,
            "stale_version",
            server_version=existing.sync_version,
            server_payload=_budget_payload(existing),
        )
    requested_category_id = None if category is None else category.id
    if existing.month != month or existing.category_id != requested_category_id:
        return _rejected(
            mutation,
            "budget_scope_immutable",
            "Budget month/category scope is immutable; replace the budget instead.",
        )

    existing.limit_amount = Decimal(payload.limitAmount)
    db.flush()
    db.refresh(existing, attribute_names=["sync_version"])
    return _MutationOutcome(
        result=_result(mutation, "applied", server_version=existing.sync_version)
    )


def _apply_mutation(
    db: Session,
    user_id: UUID,
    mutation: SyncMutationRequest,
) -> _MutationOutcome:
    if mutation.entityType == "transaction":
        return _apply_transaction_mutation(db, user_id, mutation)
    if mutation.entityType == "category":
        return _apply_category_mutation(db, user_id, mutation)
    return _apply_budget_mutation(db, user_id, mutation)


def push_sync(db: Session, user_id: UUID, payload: SyncPushRequest) -> SyncPushResponse:
    _register_device(db, user_id, payload.deviceId)
    results: list[SyncMutationResult] = []
    conflicts: list[SyncConflictResponse] = []

    for mutation in payload.mutations:
        request_hash = _request_hash(mutation)
        try:
            db.execute(
                select(
                    func.pg_advisory_xact_lock(
                        _advisory_lock_key(user_id, payload.deviceId, mutation.mutationId)
                    )
                )
            )
            stored = db.scalar(
                select(SyncMutation).where(
                    SyncMutation.user_id == user_id,
                    SyncMutation.device_id == payload.deviceId,
                    SyncMutation.mutation_id == mutation.mutationId,
                )
            )
            if stored is not None:
                if stored.request_hash != request_hash:
                    outcome = _rejected(
                        mutation,
                        "mutation_id_reused",
                        "mutationId was already used for a different request body.",
                    )
                else:
                    outcome = _stored_outcome(stored, mutation)
                db.commit()
            else:
                outcome = _apply_mutation(db, user_id, mutation)
                _persist_outcome(
                    db,
                    user_id,
                    payload.deviceId,
                    mutation,
                    request_hash,
                    outcome,
                )
        except IntegrityError:
            db.rollback()
            outcome = _rejected(
                mutation,
                "constraint_conflict",
                "The mutation conflicts with an authoritative uniqueness or integrity constraint.",
            )
            try:
                _persist_outcome(
                    db,
                    user_id,
                    payload.deviceId,
                    mutation,
                    request_hash,
                    outcome,
                )
            except IntegrityError:
                db.rollback()
                stored = db.scalar(
                    select(SyncMutation).where(
                        SyncMutation.user_id == user_id,
                        SyncMutation.device_id == payload.deviceId,
                        SyncMutation.mutation_id == mutation.mutationId,
                    )
                )
                if stored is not None and stored.request_hash == request_hash:
                    outcome = _stored_outcome(stored, mutation)
                db.rollback()
        except SQLAlchemyError:
            db.rollback()
            raise

        results.append(outcome.result)
        if outcome.conflict is not None:
            conflicts.append(outcome.conflict)

    return SyncPushResponse(
        serverTime=datetime.now(timezone.utc),
        results=results,
        conflicts=conflicts,
    )


def pull_sync(
    db: Session,
    user_id: UUID,
    cursor: str,
    *,
    limit: int,
) -> SyncPullPage:
    sequence = decode_cursor(cursor, user_id)
    rows = list(
        db.scalars(
            select(SyncChange)
            .where(
                SyncChange.sequence > sequence,
                or_(
                    SyncChange.scope_user_id == user_id,
                    SyncChange.scope_user_id.is_(None),
                ),
            )
            .order_by(SyncChange.sequence.asc())
            .limit(limit + 1)
        ).all()
    )
    has_more = len(rows) > limit
    visible = rows[:limit]
    changes = [
        SyncChangeResponse(
            cursor=encode_cursor(user_id, row.sequence),
            entityType=row.entity_type,
            entityId=row.entity_id,
            operation=row.operation,
            version=row.entity_version,
            changedAt=row.changed_at,
            payload=row.payload_json,
        )
        for row in visible
    ]
    next_cursor = cursor if not visible else changes[-1].cursor
    return SyncPullPage(
        serverTime=datetime.now(timezone.utc),
        changes=changes,
        nextCursor=next_cursor,
        hasMore=has_more,
    )


def _phase_rows(
    db: Session,
    user_id: UUID,
    phase: BootstrapPhase,
    after_id: UUID | None,
    limit: int,
) -> list[Category | Transaction | Budget]:
    if phase == "category":
        statement = select(Category).where(
            or_(Category.system_category.is_(True), Category.owner_user_id == user_id)
        )
        if after_id is not None:
            statement = statement.where(Category.id > after_id)
        return list(db.scalars(statement.order_by(Category.id.asc()).limit(limit)).all())
    if phase == "transaction":
        statement = select(Transaction).where(Transaction.user_id == user_id)
        if after_id is not None:
            statement = statement.where(Transaction.id > after_id)
        return list(db.scalars(statement.order_by(Transaction.id.asc()).limit(limit)).all())
    statement = select(Budget).where(Budget.user_id == user_id)
    if after_id is not None:
        statement = statement.where(Budget.id > after_id)
    return list(db.scalars(statement.order_by(Budget.id.asc()).limit(limit)).all())


def _bootstrap_change(
    user_id: UUID,
    high_water: int,
    entity: Category | Transaction | Budget,
    server_time: datetime,
) -> SyncChangeResponse:
    cursor = encode_cursor(user_id, high_water)
    if isinstance(entity, Category):
        entity_type = "category"
        payload = _category_payload(entity)
    elif isinstance(entity, Transaction):
        entity_type = "transaction"
        payload = _transaction_payload(entity)
    else:
        entity_type = "budget"
        payload = _budget_payload(entity)
    return SyncChangeResponse(
        cursor=cursor,
        entityType=entity_type,
        entityId=entity.id,
        operation="upsert",
        version=entity.sync_version,
        changedAt=server_time,
        payload=payload,
    )


def bootstrap_sync(
    db: Session,
    user_id: UUID,
    *,
    limit: int,
    snapshot_token: str | None,
    page_token: str | None,
) -> SyncBootstrapPage:
    if snapshot_token is None:
        if page_token is not None:
            raise ValueError("pageToken requires snapshotToken")
        high_water = int(db.scalar(select(func.coalesce(func.max(SyncChange.sequence), 0))) or 0)
        snapshot_token = encode_snapshot_token(user_id, high_water)
        phase: BootstrapPhase = "category"
        after_id: UUID | None = None
    else:
        high_water = decode_snapshot_token(snapshot_token, user_id)
        if page_token is None:
            phase = "category"
            after_id = None
        else:
            position = decode_page_token(page_token, user_id, high_water)
            phase = position.phase
            after_id = position.after_id

    server_time = datetime.now(timezone.utc)
    established_cursor = encode_cursor(user_id, high_water)
    changes: list[SyncChangeResponse] = []
    phase_index = BOOTSTRAP_PHASES.index(phase)
    current_after = after_id
    next_page_token: str | None = None

    while len(changes) < limit and phase_index < len(BOOTSTRAP_PHASES):
        current_phase = BOOTSTRAP_PHASES[phase_index]
        remaining = limit - len(changes)
        rows = _phase_rows(db, user_id, current_phase, current_after, remaining + 1)
        if len(rows) > remaining:
            visible = rows[:remaining]
            changes.extend(
                _bootstrap_change(user_id, high_water, row, server_time) for row in visible
            )
            next_page_token = encode_page_token(
                user_id, high_water, current_phase, visible[-1].id
            )
            break

        changes.extend(
            _bootstrap_change(user_id, high_water, row, server_time) for row in rows
        )
        phase_index += 1
        current_after = None
        if len(changes) == limit and phase_index < len(BOOTSTRAP_PHASES):
            next_page_token = encode_page_token(
                user_id, high_water, BOOTSTRAP_PHASES[phase_index], None
            )
            break

    return SyncBootstrapPage(
        serverTime=server_time,
        changes=changes,
        snapshotToken=snapshot_token,
        nextPageToken=next_page_token,
        establishedCursor=None if next_page_token is not None else established_cursor,
    )
