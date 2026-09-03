from __future__ import annotations

import csv
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from io import StringIO
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.transaction import Transaction
from app.report_schemas import MonthlyReportResponse, ReportCategoryBreakdown


REPORT_VERSION = "monthly-financial-report-v1"
CENT = Decimal("0.01")
ZERO = Decimal("0.00")
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r", "\n")


@dataclass(frozen=True)
class MonthlyReportTransaction:
    transaction_date: date
    transaction_type: str
    merchant: str
    category: str
    amount: Decimal
    payment_method: str
    is_recurring: bool
    source: str
    description: str


@dataclass(frozen=True)
class MonthlyReportData:
    summary: MonthlyReportResponse
    transactions: tuple[MonthlyReportTransaction, ...]


def month_bounds(month: str) -> tuple[date, date]:
    year_text, month_text = month.split("-", maxsplit=1)
    year = int(year_text)
    month_number = int(month_text)
    start = date(year, month_number, 1)
    if month_number == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month_number + 1, 1)
    return start, end


def build_monthly_report(db: Session, user_id: UUID, month: str) -> MonthlyReportData:
    start, end = month_bounds(month)
    rows = db.execute(
        select(Transaction, Category.name)
        .join(Category, Category.id == Transaction.category_id)
        .where(
            Transaction.user_id == user_id,
            Transaction.transaction_date >= start,
            Transaction.transaction_date < end,
        )
        .order_by(
            Transaction.transaction_date.asc(),
            Transaction.created_at.asc(),
            Transaction.id.asc(),
        )
    ).all()

    total_income = ZERO
    total_expenses = ZERO
    category_totals: dict[tuple[str, str], Decimal] = defaultdict(lambda: ZERO)
    category_counts: dict[tuple[str, str], int] = defaultdict(int)
    transactions: list[MonthlyReportTransaction] = []

    for transaction, category_name in rows:
        amount = Decimal(transaction.amount).quantize(CENT)
        if transaction.transaction_type == "income":
            total_income += amount
        else:
            total_expenses += amount

        key = (transaction.transaction_type, category_name)
        category_totals[key] += amount
        category_counts[key] += 1
        transactions.append(
            MonthlyReportTransaction(
                transaction_date=transaction.transaction_date,
                transaction_type=transaction.transaction_type,
                merchant=transaction.merchant,
                category=category_name,
                amount=amount,
                payment_method=transaction.payment_method,
                is_recurring=transaction.is_recurring,
                source=transaction.source,
                description=transaction.description,
            )
        )

    breakdown = [
        ReportCategoryBreakdown(
            category=category,
            type=transaction_type,
            total=total.quantize(CENT),
            transactionCount=category_counts[(transaction_type, category)],
        )
        for (transaction_type, category), total in sorted(
            category_totals.items(),
            key=lambda item: (item[0][0], -item[1], item[0][1].casefold()),
        )
    ]

    summary = MonthlyReportResponse(
        reportVersion=REPORT_VERSION,
        month=month,
        currency="EUR",
        totalIncome=total_income.quantize(CENT),
        totalExpenses=total_expenses.quantize(CENT),
        net=(total_income - total_expenses).quantize(CENT),
        transactionCount=len(transactions),
        categoryBreakdown=breakdown,
        downloadFilename=f"smart-expense-report-{month}.csv",
    )
    return MonthlyReportData(summary=summary, transactions=tuple(transactions))


def _safe_csv_text(value: str) -> str:
    if value.startswith(FORMULA_PREFIXES):
        return f"'{value}"
    return value


def render_monthly_report_csv(report: MonthlyReportData) -> str:
    output = StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    summary = report.summary

    writer.writerow(["reportVersion", summary.reportVersion])
    writer.writerow(["month", summary.month])
    writer.writerow(["currency", summary.currency])
    writer.writerow(["totalIncome", f"{summary.totalIncome:.2f}"])
    writer.writerow(["totalExpenses", f"{summary.totalExpenses:.2f}"])
    writer.writerow(["net", f"{summary.net:.2f}"])
    writer.writerow(["transactionCount", summary.transactionCount])
    writer.writerow([])

    writer.writerow(["category", "type", "total", "transactionCount"])
    for item in summary.categoryBreakdown:
        writer.writerow(
            [
                _safe_csv_text(item.category),
                item.type,
                f"{item.total:.2f}",
                item.transactionCount,
            ]
        )
    writer.writerow([])

    writer.writerow(
        [
            "date",
            "type",
            "merchant",
            "category",
            "amount",
            "paymentMethod",
            "recurring",
            "source",
            "description",
        ]
    )
    for transaction in report.transactions:
        writer.writerow(
            [
                transaction.transaction_date.isoformat(),
                transaction.transaction_type,
                _safe_csv_text(transaction.merchant),
                _safe_csv_text(transaction.category),
                f"{transaction.amount:.2f}",
                transaction.payment_method,
                "true" if transaction.is_recurring else "false",
                transaction.source,
                _safe_csv_text(transaction.description),
            ]
        )

    return output.getvalue()
