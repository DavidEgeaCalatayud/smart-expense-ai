from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.models.category import Category
from app.models.transaction import Transaction as TransactionModel
from app.schemas import (
    PaymentMethod,
    Transaction,
    TransactionCreate,
    TransactionStatus,
    TransactionType,
    TransactionUpdate,
)


class TransactionInputError(ValueError):
    """Raised when a transaction references invalid persisted data."""


def calculate_status(amount: float, transaction_type: TransactionType) -> TransactionStatus:
    """Flag high-value expenses for deterministic user review."""
    if transaction_type == TransactionType.expense and amount > 120:
        return TransactionStatus.review
    return TransactionStatus.normal


def _parse_transaction_id(transaction_id: str) -> UUID | None:
    try:
        return UUID(transaction_id)
    except ValueError:
        return None


def _parse_transaction_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise TransactionInputError("Transaction date must use YYYY-MM-DD format") from exc


def _get_category(
    db: Session,
    category_name: str,
    transaction_type: TransactionType,
) -> Category:
    category = db.scalar(select(Category).where(Category.name == category_name))
    if category is None:
        raise TransactionInputError(f"Unknown category: {category_name}")

    if category.transaction_type != transaction_type.value:
        raise TransactionInputError(
            f"Category {category_name} is not valid for {transaction_type.value} transactions"
        )

    return category


def _to_schema(transaction: TransactionModel) -> Transaction:
    transaction_type = TransactionType(transaction.transaction_type)
    amount = float(transaction.amount)

    return Transaction(
        id=str(transaction.id),
        merchant=transaction.merchant,
        description=transaction.description,
        category=transaction.category.name,
        amount=amount,
        date=transaction.transaction_date.isoformat(),
        type=transaction_type,
        paymentMethod=PaymentMethod(transaction.payment_method),
        status=calculate_status(amount, transaction_type),
        isRecurring=transaction.is_recurring,
    )


def _commit(db: Session) -> None:
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise


def list_transactions(db: Session) -> list[Transaction]:
    statement = (
        select(TransactionModel)
        .options(joinedload(TransactionModel.category))
        .order_by(TransactionModel.created_at.desc())
    )
    transactions = db.scalars(statement).all()
    return [_to_schema(transaction) for transaction in transactions]


def create_transaction(db: Session, payload: TransactionCreate) -> Transaction:
    category = _get_category(db, payload.category, payload.type)
    transaction = TransactionModel(
        category=category,
        merchant=payload.merchant,
        description=payload.description,
        amount=Decimal(str(payload.amount)),
        currency="EUR",
        transaction_date=_parse_transaction_date(payload.date),
        transaction_type=payload.type.value,
        payment_method=payload.paymentMethod.value,
        is_recurring=payload.isRecurring,
        source="manual",
    )

    db.add(transaction)
    _commit(db)
    return _to_schema(transaction)


def update_transaction(
    db: Session,
    transaction_id: str,
    payload: TransactionUpdate,
) -> Transaction | None:
    parsed_id = _parse_transaction_id(transaction_id)
    if parsed_id is None:
        return None

    statement = (
        select(TransactionModel)
        .options(joinedload(TransactionModel.category))
        .where(TransactionModel.id == parsed_id)
    )
    transaction = db.scalar(statement)
    if transaction is None:
        return None

    transaction.category = _get_category(db, payload.category, payload.type)
    transaction.merchant = payload.merchant
    transaction.description = payload.description
    transaction.amount = Decimal(str(payload.amount))
    transaction.transaction_date = _parse_transaction_date(payload.date)
    transaction.transaction_type = payload.type.value
    transaction.payment_method = payload.paymentMethod.value
    transaction.is_recurring = payload.isRecurring

    _commit(db)
    return _to_schema(transaction)


def delete_transaction(db: Session, transaction_id: str) -> bool:
    parsed_id = _parse_transaction_id(transaction_id)
    if parsed_id is None:
        return False

    transaction = db.get(TransactionModel, parsed_id)
    if transaction is None:
        return False

    db.delete(transaction)
    _commit(db)
    return True
