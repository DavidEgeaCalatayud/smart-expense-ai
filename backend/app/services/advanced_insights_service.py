from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from sqlalchemy.orm import Session

from app.advanced_insight_schemas import (
    AdvancedInsightCard,
    AdvancedInsightEvidence,
    AdvancedInsightMetric,
    AdvancedInsightsResponse,
)
from app.services.budget_service import get_budget_month
from app.services.intelligence_service import get_intelligence_summary
from app.services.report_service import REPORT_VERSION, build_monthly_report, month_bounds


INSIGHT_VERSION = "advanced-financial-insights-v1"
ZERO = Decimal("0.00")
ONE_DECIMAL = Decimal("0.1")


def _previous_month(month: str) -> str:
    start, _ = month_bounds(month)
    if start.month == 1:
        return f"{start.year - 1}-12"
    return f"{start.year}-{start.month - 1:02d}"


def _percent(numerator: Decimal, denominator: Decimal) -> Decimal | None:
    if denominator == ZERO:
        return None
    return ((numerator / denominator) * Decimal("100")).quantize(
        ONE_DECIMAL,
        rounding=ROUND_HALF_UP,
    )


def _metric(key: str, label: str, value: str, metric_format: str) -> AdvancedInsightMetric:
    return AdvancedInsightMetric(key=key, label=label, value=value, format=metric_format)


def _evidence(source: str, reference: str, *metrics: AdvancedInsightMetric) -> AdvancedInsightEvidence:
    return AdvancedInsightEvidence(source=source, reference=reference, metrics=list(metrics))


def _money(value: Decimal) -> str:
    return f"{value.quantize(Decimal('0.01')):.2f}"


def build_advanced_insights(db: Session, user_id: UUID, month: str) -> AdvancedInsightsResponse:
    current = build_monthly_report(db, user_id, month).summary
    previous_month = _previous_month(month)
    previous = build_monthly_report(db, user_id, previous_month).summary
    budgets = get_budget_month(db, user_id, month, today=date.today())
    intelligence = get_intelligence_summary(db, user_id)

    cards: list[AdvancedInsightCard] = []

    budget_items = ([budgets.totalBudget] if budgets.totalBudget is not None else []) + list(
        budgets.categoryBudgets
    )
    if budget_items:
        highest = max(budget_items, key=lambda item: Decimal(item.percentUsed))
        over_budget_count = sum(1 for item in budget_items if item.overBudget)
        cards.append(
            AdvancedInsightCard(
                id=f"{month}:budget-pressure",
                kind="budget_pressure",
                priority="attention" if over_budget_count else "info",
                title="Budget pressure",
                summary=(
                    f"{over_budget_count} of {len(budget_items)} configured budgets are over limit."
                    if over_budget_count
                    else "All configured budgets remain within their stored limits."
                ),
                evidence=[
                    _evidence(
                        "budgets",
                        month,
                        _metric("budgetCount", "Configured budgets", str(len(budget_items)), "count"),
                        _metric("overBudgetCount", "Over budget", str(over_budget_count), "count"),
                        _metric(
                            "highestPercentUsed",
                            "Highest utilization",
                            highest.percentUsed,
                            "percent",
                        ),
                        _metric(
                            "highestScope",
                            "Highest-utilization scope",
                            highest.categoryName or "Overall spending",
                            "text",
                        ),
                    )
                ],
            )
        )

    cards.append(
        AdvancedInsightCard(
            id=f"{month}:open-findings",
            kind="open_findings",
            priority="attention" if intelligence.openCount else "info",
            title="Open intelligence findings",
            summary=(
                f"{intelligence.openCount} unresolved financial-intelligence findings need review."
                if intelligence.openCount
                else "No unresolved financial-intelligence findings are currently persisted."
            ),
            evidence=[
                _evidence(
                    "financial-intelligence",
                    "open-findings",
                    _metric("openCount", "Open findings", str(intelligence.openCount), "count"),
                    _metric("anomalyCount", "Anomalies", str(intelligence.anomalyCount), "count"),
                    _metric(
                        "duplicateSubscriptionCount",
                        "Duplicate subscriptions",
                        str(intelligence.duplicateSubscriptionCount),
                        "count",
                    ),
                    _metric(
                        "missingRecurringCount",
                        "Missing recurring payments",
                        str(intelligence.missingRecurringCount),
                        "count",
                    ),
                    _metric("ruleVersion", "Rules contract", intelligence.ruleVersion, "text"),
                )
            ],
        )
    )

    net = Decimal(current.net)
    cards.append(
        AdvancedInsightCard(
            id=f"{month}:cash-flow",
            kind="cash_flow",
            priority="positive" if net > ZERO else "attention" if net < ZERO else "info",
            title="Monthly cash flow",
            summary=(
                f"Income exceeds expenses by €{_money(net)} for {month}."
                if net > ZERO
                else f"Expenses exceed income by €{_money(abs(net))} for {month}."
                if net < ZERO
                else f"Income and expenses are balanced for {month}."
            ),
            evidence=[
                _evidence(
                    REPORT_VERSION,
                    month,
                    _metric("totalIncome", "Income", _money(Decimal(current.totalIncome)), "currency"),
                    _metric(
                        "totalExpenses",
                        "Expenses",
                        _money(Decimal(current.totalExpenses)),
                        "currency",
                    ),
                    _metric("net", "Net", _money(net), "currency"),
                    _metric(
                        "transactionCount",
                        "Transactions",
                        str(current.transactionCount),
                        "count",
                    ),
                )
            ],
        )
    )

    current_expenses = Decimal(current.totalExpenses)
    previous_expenses = Decimal(previous.totalExpenses)
    expense_delta = current_expenses - previous_expenses
    change_percent = _percent(expense_delta, previous_expenses)
    trend_metrics = [
        _metric("currentExpenses", f"Expenses {month}", _money(current_expenses), "currency"),
        _metric(
            "previousExpenses",
            f"Expenses {previous_month}",
            _money(previous_expenses),
            "currency",
        ),
        _metric("expenseDelta", "Expense delta", _money(expense_delta), "currency"),
    ]
    if change_percent is not None:
        trend_metrics.append(
            _metric("expenseChangePercent", "Expense change", f"{change_percent:.1f}", "percent")
        )
    cards.append(
        AdvancedInsightCard(
            id=f"{month}:expense-change",
            kind="expense_change",
            priority=(
                "attention"
                if expense_delta > ZERO
                else "positive"
                if expense_delta < ZERO
                else "info"
            ),
            title="Month-over-month expenses",
            summary=(
                f"Expenses increased by €{_money(expense_delta)} versus {previous_month}."
                if expense_delta > ZERO
                else f"Expenses decreased by €{_money(abs(expense_delta))} versus {previous_month}."
                if expense_delta < ZERO
                else f"Expenses are unchanged versus {previous_month}."
            ),
            evidence=[_evidence(REPORT_VERSION, f"{previous_month}->{month}", *trend_metrics)],
        )
    )

    expense_categories = [item for item in current.categoryBreakdown if item.type == "expense"]
    if expense_categories and current_expenses > ZERO:
        top = expense_categories[0]
        share = _percent(Decimal(top.total), current_expenses) or ZERO
        cards.append(
            AdvancedInsightCard(
                id=f"{month}:category-concentration",
                kind="category_concentration",
                priority="info",
                title="Largest expense category",
                summary=f"{top.category} represents {share:.1f}% of expenses in {month}.",
                evidence=[
                    _evidence(
                        REPORT_VERSION,
                        f"{month}:category:{top.category}",
                        _metric("category", "Category", top.category, "text"),
                        _metric("amount", "Category spend", _money(Decimal(top.total)), "currency"),
                        _metric("share", "Share of expenses", f"{share:.1f}", "percent"),
                        _metric(
                            "transactionCount",
                            "Transactions",
                            str(top.transactionCount),
                            "count",
                        ),
                    )
                ],
            )
        )

    priority_rank = {"attention": 0, "positive": 1, "info": 2}
    kind_rank = {
        "budget_pressure": 0,
        "open_findings": 1,
        "cash_flow": 2,
        "expense_change": 3,
        "category_concentration": 4,
    }
    cards.sort(key=lambda card: (priority_rank[card.priority], kind_rank[card.kind], card.id))

    return AdvancedInsightsResponse(
        insightVersion=INSIGHT_VERSION,
        month=month,
        currency="EUR",
        insights=cards,
        sourceContracts={
            "monthlyReport": REPORT_VERSION,
            "intelligenceRules": intelligence.ruleVersion,
            "budgetProgress": "budget-service",
        },
        limitations=[
            "Insights are deterministic summaries of stored account evidence and are not financial advice.",
            "Open findings reflect the latest persisted financial-intelligence scan; this endpoint does not run a new scan.",
            "The selected calendar month includes all transactions currently stored inside that month; this endpoint does not invent forecast confidence or apply an as-of cutoff.",
        ],
    )
