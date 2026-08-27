from __future__ import annotations

from calendar import monthrange
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.budget_schemas import BudgetDefinitionResponse, BudgetMonthResponse, BudgetProgressResponse
from app.models.budget import Budget
from app.models.transaction import Transaction as TransactionModel
from app.schemas import TransactionType
from app.services.category_service import get_active_visible_category_by_id


MONEY_CENT = Decimal("0.01")
ZERO = Decimal("0.00")


class BudgetInputError(ValueError):
    pass


class BudgetConflictError(RuntimeError):
    pass


def _money(value: object) -> Decimal:
    return (value if isinstance(value, Decimal) else Decimal(str(value))).quantize(MONEY_CENT)


def _parse_month(value: str) -> date:
    try:
        year_text, month_text = value.split("-", 1)
        year = int(year_text)
        month = int(month_text)
        return date(year, month, 1)
    except (ValueError, TypeError) as exc:
        raise BudgetInputError("month must use YYYY-MM format") from exc


def _next_month(month: date) -> date:
    return date(month.year + (1 if month.month == 12 else 0), 1 if month.month == 12 else month.month + 1, 1)


def _parse_budget_id(value: str) -> UUID | None:
    try:
        return UUID(value)
    except ValueError:
        return None


def _definition(budget: Budget) -> BudgetDefinitionResponse:
    return BudgetDefinitionResponse(
        id=str(budget.id),
        month=budget.month.strftime("%Y-%m"),
        categoryId=str(budget.category_id) if budget.category_id else None,
        categoryName=budget.category.name if budget.category else None,
        categoryArchived=bool(budget.category.archived) if budget.category else False,
        limitAmount=f"{_money(budget.limit_amount):.2f}",
    )


def create_budget(
    db: Session,
    user_id: UUID,
    month: str,
    category_id: str | None,
    limit_amount: Decimal,
) -> BudgetDefinitionResponse:
    month_date = _parse_month(month)
    category = None
    if category_id is not None:
        category = get_active_visible_category_by_id(db, user_id, category_id)
        if category is None:
            raise BudgetInputError("Budget category is not available")
        if category.transaction_type != TransactionType.expense.value:
            raise BudgetInputError("Budgets can only target expense categories")

    duplicate_conditions = [Budget.user_id == user_id, Budget.month == month_date]
    if category is None:
        duplicate_conditions.append(Budget.category_id.is_(None))
    else:
        duplicate_conditions.append(Budget.category_id == category.id)
    if db.scalar(select(Budget.id).where(*duplicate_conditions).limit(1)) is not None:
        raise BudgetConflictError("A budget already exists for this month and scope")

    budget = Budget(
        user_id=user_id,
        category=category,
        month=month_date,
        limit_amount=_money(limit_amount),
    )
    db.add(budget)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise BudgetConflictError("A budget already exists for this month and scope") from exc
    db.refresh(budget)
    return _definition(budget)


def update_budget(
    db: Session,
    user_id: UUID,
    budget_id: str,
    limit_amount: Decimal,
) -> BudgetDefinitionResponse | None:
    parsed = _parse_budget_id(budget_id)
    if parsed is None:
        return None
    budget = db.scalar(
        select(Budget)
        .options(joinedload(Budget.category))
        .where(Budget.id == parsed, Budget.user_id == user_id)
    )
    if budget is None:
        return None
    budget.limit_amount = _money(limit_amount)
    db.commit()
    return _definition(budget)


def delete_budget(db: Session, user_id: UUID, budget_id: str) -> bool:
    parsed = _parse_budget_id(budget_id)
    if parsed is None:
        return False
    budget = db.scalar(select(Budget).where(Budget.id == parsed, Budget.user_id == user_id))
    if budget is None:
        return False
    db.delete(budget)
    db.commit()
    return True


def _days_remaining(month: date, today: date) -> int:
    if today < month:
        return monthrange(month.year, month.month)[1]
    end = _next_month(month)
    if today >= end:
        return 0
    return max((end - today).days - 1, 0)


def _progress(
    budget: Budget,
    spent: Decimal,
    today: date,
) -> BudgetProgressResponse:
    limit_amount = _money(budget.limit_amount)
    spent_amount = _money(spent)
    remaining = _money(limit_amount - spent_amount)
    percent = ((spent_amount / limit_amount) * Decimal("100")).quantize(
        Decimal("0.1"), rounding=ROUND_HALF_UP
    )
    definition = _definition(budget)
    return BudgetProgressResponse(
        **definition.model_dump(),
        spentAmount=f"{spent_amount:.2f}",
        remainingAmount=f"{remaining:.2f}",
        percentUsed=f"{percent:.1f}",
        daysRemaining=_days_remaining(budget.month, today),
        overBudget=spent_amount > limit_amount,
    )


def get_budget_month(
    db: Session,
    user_id: UUID,
    month: str,
    *,
    today: date | None = None,
) -> BudgetMonthResponse:
    month_date = _parse_month(month)
    next_month = _next_month(month_date)
    budgets = db.scalars(
        select(Budget)
        .options(joinedload(Budget.category))
        .where(Budget.user_id == user_id, Budget.month == month_date)
        .order_by(Budget.category_id.asc().nullsfirst(), Budget.id)
    ).all()

    total_spent = _money(
        db.scalar(
            select(func.coalesce(func.sum(TransactionModel.amount), 0)).where(
                TransactionModel.user_id == user_id,
                TransactionModel.transaction_type == TransactionType.expense.value,
                TransactionModel.transaction_date >= month_date,
                TransactionModel.transaction_date < next_month,
            )
        )
        or 0
    )
    category_rows = db.execute(
        select(TransactionModel.category_id, func.sum(TransactionModel.amount))
        .where(
            TransactionModel.user_id == user_id,
            TransactionModel.transaction_type == TransactionType.expense.value,
            TransactionModel.transaction_date >= month_date,
            TransactionModel.transaction_date < next_month,
        )
        .group_by(TransactionModel.category_id)
    ).all()
    category_spend = {row[0]: _money(row[1]) for row in category_rows}
    effective_today = today or date.today()

    total_budget = next((budget for budget in budgets if budget.category_id is None), None)
    category_budgets = [budget for budget in budgets if budget.category_id is not None]
    return BudgetMonthResponse(
        month=month_date.strftime("%Y-%m"),
        totalBudget=_progress(total_budget, total_spent, effective_today) if total_budget else None,
        categoryBudgets=[
            _progress(budget, category_spend.get(budget.category_id, ZERO), effective_today)
            for budget in category_budgets
        ],
    )
