from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.transaction import Transaction as TransactionModel
from app.schemas import TransactionType
from app.services.transaction_service import summarize_transactions


MONEY_CENT = Decimal("0.01")
PERCENT_CENT = Decimal("0.01")


class FinancialComparisonInputError(ValueError):
    pass


def _month_bounds(value: str) -> tuple[date, date]:
    try:
        year_text, month_text = value.split("-", 1)
        start = date(int(year_text), int(month_text), 1)
    except (TypeError, ValueError) as exc:
        raise FinancialComparisonInputError("Periods must use YYYY-MM format") from exc
    if start.month == 12:
        end = date(start.year + 1, 1, 1)
    else:
        end = date(start.year, start.month + 1, 1)
    return start, end


def _money(value: Decimal) -> Decimal:
    return Decimal(value).quantize(MONEY_CENT)


def _category_expenses(
    db: Session,
    user_id: UUID,
    start: date,
    end: date,
) -> dict[str, Decimal]:
    rows = db.execute(
        select(Category.name, func.sum(TransactionModel.amount))
        .join(Category, Category.id == TransactionModel.category_id)
        .where(
            TransactionModel.user_id == user_id,
            TransactionModel.transaction_type == TransactionType.expense.value,
            TransactionModel.transaction_date >= start,
            TransactionModel.transaction_date < end,
        )
        .group_by(Category.name)
    ).all()
    return {str(name): _money(amount) for name, amount in rows}


def compare_months(
    db: Session,
    user_id: UUID,
    period_a: str,
    period_b: str,
    *,
    category_limit: int = 8,
) -> dict[str, object]:
    start_a, end_a = _month_bounds(period_a)
    start_b, end_b = _month_bounds(period_b)
    summary_a = summarize_transactions(
        db,
        user_id,
        date_from=start_a,
        date_to=end_a.fromordinal(end_a.toordinal() - 1),
    )
    summary_b = summarize_transactions(
        db,
        user_id,
        date_from=start_b,
        date_to=end_b.fromordinal(end_b.toordinal() - 1),
    )
    expenses_a = _money(summary_a.totalExpenses)
    expenses_b = _money(summary_b.totalExpenses)
    difference = _money(expenses_b - expenses_a)
    difference_percent = None
    if expenses_a != 0:
        difference_percent = ((difference / expenses_a) * Decimal("100")).quantize(
            PERCENT_CENT,
            rounding=ROUND_HALF_UP,
        )

    category_a = _category_expenses(db, user_id, start_a, end_a)
    category_b = _category_expenses(db, user_id, start_b, end_b)
    category_changes = []
    for category in set(category_a) | set(category_b):
        previous = category_a.get(category, Decimal("0.00"))
        current = category_b.get(category, Decimal("0.00"))
        delta = _money(current - previous)
        if delta == 0:
            continue
        category_changes.append(
            {
                "category": category,
                "periodAExpenses": previous,
                "periodBExpenses": current,
                "difference": delta,
            }
        )
    category_changes.sort(
        key=lambda item: (-abs(Decimal(item["difference"])), str(item["category"]).casefold())
    )

    return {
        "periodA": {
            "label": period_a,
            "expenses": expenses_a,
            "income": _money(summary_a.totalIncome),
            "balance": _money(summary_a.balance),
            "transactionCount": summary_a.transactionCount,
        },
        "periodB": {
            "label": period_b,
            "expenses": expenses_b,
            "income": _money(summary_b.totalIncome),
            "balance": _money(summary_b.balance),
            "transactionCount": summary_b.transactionCount,
        },
        "difference": difference,
        "differencePercent": difference_percent,
        "topCategoryChanges": category_changes[:category_limit],
    }
