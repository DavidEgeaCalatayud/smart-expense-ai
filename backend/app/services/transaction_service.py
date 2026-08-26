from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import and_, case, func, not_, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.models.category import Category
from app.models.transaction import Transaction as TransactionModel
from app.schemas import (
    MonthlyExpense,
    PaymentMethod,
    Transaction,
    TransactionCreate,
    TransactionPage,
    TransactionSort,
    TransactionStatus,
    TransactionSummary,
    TransactionType,
    TransactionUpdate,
)
from app.services.category_service import get_active_visible_category


MONEY_CENT = Decimal("0.01")
MONEY_ZERO = Decimal("0.00")
REVIEW_THRESHOLD = Decimal("120.00")


class TransactionInputError(ValueError):
    """Raised when a transaction references invalid persisted data."""


def calculate_status(amount: Decimal, transaction_type: TransactionType) -> TransactionStatus:
    """Flag high-value expenses for deterministic user review."""
    if transaction_type == TransactionType.expense and amount > REVIEW_THRESHOLD:
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
    user_id: UUID,
    category_name: str,
    transaction_type: TransactionType,
) -> Category:
    category = get_active_visible_category(db, user_id, category_name, transaction_type)
    if category is None:
        raise TransactionInputError(f"Unknown or unavailable category: {category_name}")
    return category


def _as_decimal(value: object) -> Decimal:
    decimal_value = value if isinstance(value, Decimal) else Decimal(str(value))
    return decimal_value.quantize(MONEY_CENT)


def _to_schema(transaction: TransactionModel) -> Transaction:
    transaction_type = TransactionType(transaction.transaction_type)
    amount = _as_decimal(transaction.amount)

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


def _filter_conditions(
    user_id: UUID,
    *,
    search: str | None = None,
    category: str | None = None,
    status: TransactionStatus | None = None,
    transaction_type: TransactionType | None = None,
    recurring: bool | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[object]:
    conditions: list[object] = [TransactionModel.user_id == user_id]

    if search:
        term = f"%{search.strip().lower()}%"
        conditions.append(
            or_(
                func.lower(TransactionModel.merchant).like(term),
                func.lower(TransactionModel.description).like(term),
            )
        )
    if category:
        conditions.append(TransactionModel.category.has(Category.name == category))
    if transaction_type is not None:
        conditions.append(TransactionModel.transaction_type == transaction_type.value)
    if recurring is not None:
        conditions.append(TransactionModel.is_recurring.is_(recurring))
    if date_from is not None:
        conditions.append(TransactionModel.transaction_date >= date_from)
    if date_to is not None:
        conditions.append(TransactionModel.transaction_date <= date_to)

    review_condition = and_(
        TransactionModel.transaction_type == TransactionType.expense.value,
        TransactionModel.amount > REVIEW_THRESHOLD,
    )
    if status == TransactionStatus.review:
        conditions.append(review_condition)
    elif status == TransactionStatus.normal:
        conditions.append(not_(review_condition))

    return conditions


def list_transactions(
    db: Session,
    user_id: UUID,
    *,
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
    category: str | None = None,
    status: TransactionStatus | None = None,
    transaction_type: TransactionType | None = None,
    recurring: bool | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    sort: TransactionSort = TransactionSort.newest,
) -> TransactionPage:
    conditions = _filter_conditions(
        user_id,
        search=search,
        category=category,
        status=status,
        transaction_type=transaction_type,
        recurring=recurring,
        date_from=date_from,
        date_to=date_to,
    )

    sort_expression = {
        TransactionSort.newest: TransactionModel.transaction_date.desc(),
        TransactionSort.oldest: TransactionModel.transaction_date.asc(),
        TransactionSort.amount_high: TransactionModel.amount.desc(),
        TransactionSort.amount_low: TransactionModel.amount.asc(),
    }[sort]

    total = db.scalar(
        select(func.count()).select_from(TransactionModel).where(*conditions)
    ) or 0
    statement = (
        select(TransactionModel)
        .options(joinedload(TransactionModel.category))
        .where(*conditions)
        .order_by(sort_expression, TransactionModel.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    transactions = db.scalars(statement).all()

    return TransactionPage(
        items=[_to_schema(transaction) for transaction in transactions],
        page=page,
        pageSize=page_size,
        total=total,
        pages=(total + page_size - 1) // page_size,
    )


def summarize_transactions(
    db: Session,
    user_id: UUID,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> TransactionSummary:
    conditions = _filter_conditions(user_id, date_from=date_from, date_to=date_to)
    review_condition = and_(
        TransactionModel.transaction_type == TransactionType.expense.value,
        TransactionModel.amount > REVIEW_THRESHOLD,
    )

    row = db.execute(
        select(
            func.coalesce(
                func.sum(case((TransactionModel.transaction_type == "income", TransactionModel.amount), else_=0)),
                0,
            ),
            func.coalesce(
                func.sum(case((TransactionModel.transaction_type == "expense", TransactionModel.amount), else_=0)),
                0,
            ),
            func.sum(case((TransactionModel.is_recurring.is_(True), 1), else_=0)),
            func.sum(case((review_condition, 1), else_=0)),
            func.count(TransactionModel.id),
        ).where(*conditions)
    ).one()

    income = _as_decimal(row[0])
    expenses = _as_decimal(row[1])
    return TransactionSummary(
        totalIncome=income,
        totalExpenses=expenses,
        balance=_as_decimal(income - expenses),
        recurringCount=int(row[2] or 0),
        reviewCount=int(row[3] or 0),
        transactionCount=int(row[4] or 0),
    )


def monthly_expenses(
    db: Session,
    user_id: UUID,
    *,
    months: int,
    through: date,
) -> list[MonthlyExpense]:
    end_month = through.replace(day=1)
    year = end_month.year
    month = end_month.month - (months - 1)
    while month <= 0:
        month += 12
        year -= 1
    start_month = date(year, month, 1)

    month_key = func.to_char(func.date_trunc("month", TransactionModel.transaction_date), "YYYY-MM")
    rows = db.execute(
        select(month_key, func.sum(TransactionModel.amount))
        .where(
            TransactionModel.user_id == user_id,
            TransactionModel.transaction_type == TransactionType.expense.value,
            TransactionModel.transaction_date >= start_month,
        )
        .group_by(month_key)
        .order_by(month_key)
    ).all()
    amounts = {str(row[0]): _as_decimal(row[1]) for row in rows}

    result: list[MonthlyExpense] = []
    cursor_year = start_month.year
    cursor_month = start_month.month
    for _ in range(months):
        key = f"{cursor_year:04d}-{cursor_month:02d}"
        result.append(MonthlyExpense(month=key, amount=amounts.get(key, MONEY_ZERO)))
        cursor_month += 1
        if cursor_month == 13:
            cursor_month = 1
            cursor_year += 1
    return result


def create_transaction(db: Session, user_id: UUID, payload: TransactionCreate) -> Transaction:
    category = _get_category(db, user_id, payload.category, payload.type)
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
    _commit(db)
    return _to_schema(transaction)


def update_transaction(
    db: Session,
    user_id: UUID,
    transaction_id: str,
    payload: TransactionUpdate,
) -> Transaction | None:
    parsed_id = _parse_transaction_id(transaction_id)
    if parsed_id is None:
        return None

    statement = (
        select(TransactionModel)
        .options(joinedload(TransactionModel.category))
        .where(
            TransactionModel.id == parsed_id,
            TransactionModel.user_id == user_id,
        )
    )
    transaction = db.scalar(statement)
    if transaction is None:
        return None

    transaction.category = _get_category(db, user_id, payload.category, payload.type)
    transaction.merchant = payload.merchant
    transaction.description = payload.description
    transaction.amount = payload.amount
    transaction.transaction_date = _parse_transaction_date(payload.date)
    transaction.transaction_type = payload.type.value
    transaction.payment_method = payload.paymentMethod.value
    transaction.is_recurring = payload.isRecurring

    _commit(db)
    return _to_schema(transaction)


def delete_transaction(db: Session, user_id: UUID, transaction_id: str) -> bool:
    parsed_id = _parse_transaction_id(transaction_id)
    if parsed_id is None:
        return False

    transaction = db.scalar(
        select(TransactionModel).where(
            TransactionModel.id == parsed_id,
            TransactionModel.user_id == user_id,
        )
    )
    if transaction is None:
        return False

    db.delete(transaction)
    _commit(db)
    return True
