from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.models.transaction import Transaction as TransactionModel
from app.schemas import Transaction, TransactionCreateV2, TransactionUpdateV2
from app.services.category_suggestion_service import (
    build_category_suggestion,
    record_category_feedback,
)
from app.services.transaction_service import (
    _get_visible_category,
    _parse_transaction_date,
    _parse_transaction_id,
    _to_schema,
)


def _commit(db: Session) -> None:
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise


def create_transaction_with_feedback(
    db: Session,
    user_id: UUID,
    payload: TransactionCreateV2,
) -> Transaction:
    candidate = build_category_suggestion(db, user_id, payload.merchant, payload.type)
    category = _get_visible_category(db, user_id, payload.category, payload.type)
    transaction = TransactionModel(
        user_id=user_id,
        category=category,
        merchant=payload.merchant,
        description=payload.description,
        amount=payload.amount,
        currency="EUR",
        transaction_date=_parse_transaction_date(payload.date),
        transaction_type=payload.type.value,
        payment_method=payload.paymentMethod.value,
        is_recurring=payload.isRecurring,
        source="manual",
    )
    db.add(transaction)
    db.flush()
    record_category_feedback(db, user_id, transaction, candidate, category)
    _commit(db)
    return _to_schema(transaction)


def update_transaction_with_feedback(
    db: Session,
    user_id: UUID,
    transaction_id: str,
    payload: TransactionUpdateV2,
) -> Transaction | None:
    parsed_id = _parse_transaction_id(transaction_id)
    if parsed_id is None:
        return None

    transaction = db.scalar(
        select(TransactionModel)
        .options(joinedload(TransactionModel.category))
        .where(
            TransactionModel.id == parsed_id,
            TransactionModel.user_id == user_id,
        )
    )
    if transaction is None:
        return None

    candidate = build_category_suggestion(
        db,
        user_id,
        payload.merchant,
        payload.type,
        exclude_transaction_id=transaction.id,
    )
    category = _get_visible_category(db, user_id, payload.category, payload.type)
    transaction.category = category
    transaction.merchant = payload.merchant
    transaction.description = payload.description
    transaction.amount = payload.amount
    transaction.transaction_date = _parse_transaction_date(payload.date)
    transaction.transaction_type = payload.type.value
    transaction.payment_method = payload.paymentMethod.value
    transaction.is_recurring = payload.isRecurring

    db.flush()
    record_category_feedback(db, user_id, transaction, candidate, category)
    _commit(db)
    return _to_schema(transaction)
