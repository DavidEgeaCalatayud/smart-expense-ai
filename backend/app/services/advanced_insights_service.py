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
from app.services.financial_account_service import (
    get_financial_accounts_summary,
    get_net_worth_history,
    get_net_worth_summary,
)
from app.services.intelligence_service import get_intelligence_summary
from app.services.report_service import REPORT_VERSION, build_monthly_report, month_bounds


INSIGHT_VERSION = "advanced-financial-insights-v1"
NET_WORTH_CONTRACT = "manual-net-worth-v1"
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


def _ratio(numerator: Decimal, denominator: Decimal) -> Decimal | None:
    if denominator <= ZERO:
        return None
    return (numerator / denominator).quantize(ONE_DECIMAL, rounding=ROUND_HALF_UP)


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
    previous_previous_month = _previous_month(previous_month)
    previous_previous = build_monthly_report(db, user_id, previous_previous_month).summary
    budgets = get_budget_month(db, user_id, month, today=date.today())
    intelligence = get_intelligence_summary(db, user_id)
    net_worth = get_net_worth_summary(db, user_id)
    account_summary = get_financial_accounts_summary(db, user_id)
    net_worth_history = get_net_worth_history(db, user_id, 12)

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

    trailing_expenses = (
        current_expenses
        + previous_expenses
        + Decimal(previous_previous.totalExpenses)
    ) / Decimal("3")
    liquid_capital = Decimal(net_worth.available) + Decimal(net_worth.reserved)
    liquidity_months = _ratio(liquid_capital, trailing_expenses)
    cards.append(
        AdvancedInsightCard(
            id="current:net-worth-liquidity",
            kind="net_worth_liquidity",
            priority="info",
            title="Liquidity coverage",
            summary=(
                f"Current liquid and reserved capital covers about {liquidity_months:.1f} months of the recent three-month average spend."
                if liquidity_months is not None
                else "Liquidity coverage is unavailable until stored expenses provide a non-zero recent monthly average."
            ),
            evidence=[
                _evidence(
                    NET_WORTH_CONTRACT,
                    "current:liquidity",
                    _metric("liquidCapital", "Liquid + reserved capital", _money(liquid_capital), "currency"),
                    _metric("averageMonthlyExpenses", "3-month average expenses", _money(trailing_expenses), "currency"),
                    *(
                        [_metric("coverageMonths", "Coverage", f"{liquidity_months:.1f} months", "text")]
                        if liquidity_months is not None
                        else []
                    ),
                )
            ],
        )
    )

    invested_percent = account_summary.investedPercent
    cards.append(
        AdvancedInsightCard(
            id="current:investment-share",
            kind="investment_share",
            priority="info",
            title="Invested share of net worth",
            summary=(
                f"{invested_percent}% of the current manually maintained net worth is classified as investment capital."
                if invested_percent is not None
                else "Investment share is unavailable while included net worth is zero."
            ),
            evidence=[
                _evidence(
                    NET_WORTH_CONTRACT,
                    "current:investment-share",
                    _metric("invested", "Invested capital", net_worth.invested, "currency"),
                    _metric("totalNetWorth", "Total net worth", net_worth.totalNetWorth, "currency"),
                    *(
                        [_metric("investedPercent", "Invested share", invested_percent, "percent")]
                        if invested_percent is not None
                        else []
                    ),
                )
            ],
        )
    )

    emergency_fund = Decimal(net_worth.emergencyFund)
    emergency_months = _ratio(emergency_fund, trailing_expenses)
    cards.append(
        AdvancedInsightCard(
            id="current:emergency-coverage",
            kind="emergency_coverage",
            priority="info",
            title="Emergency-fund coverage",
            summary=(
                f"The amount classified as emergency fund covers about {emergency_months:.1f} months of the recent three-month average spend."
                if emergency_months is not None
                else "Emergency-fund coverage is unavailable until stored expenses provide a non-zero recent monthly average."
            ),
            evidence=[
                _evidence(
                    NET_WORTH_CONTRACT,
                    "current:emergency-coverage",
                    _metric("emergencyFund", "Emergency fund", _money(emergency_fund), "currency"),
                    _metric("averageMonthlyExpenses", "3-month average expenses", _money(trailing_expenses), "currency"),
                    *(
                        [_metric("coverageMonths", "Coverage", f"{emergency_months:.1f} months", "text")]
                        if emergency_months is not None
                        else []
                    ),
                )
            ],
        )
    )

    growth_amount = Decimal(net_worth_history.changeAmount)
    cards.append(
        AdvancedInsightCard(
            id="current:net-worth-growth",
            kind="net_worth_growth",
            priority="positive" if growth_amount > ZERO else "attention" if growth_amount < ZERO else "info",
            title="12-month net-worth change",
            summary=(
                f"Recorded net worth increased by €{_money(growth_amount)} over the 12-month history window."
                if growth_amount > ZERO
                else f"Recorded net worth decreased by €{_money(abs(growth_amount))} over the 12-month history window."
                if growth_amount < ZERO
                else "Recorded net worth is unchanged over the 12-month history window."
            ),
            evidence=[
                _evidence(
                    NET_WORTH_CONTRACT,
                    "history:12-months",
                    _metric("changeAmount", "12-month change", net_worth_history.changeAmount, "currency"),
                    *(
                        [_metric("changePercent", "12-month change", net_worth_history.changePercent, "percent")]
                        if net_worth_history.changePercent is not None
                        else []
                    ),
                )
            ],
        )
    )

    cards.append(
        AdvancedInsightCard(
            id="current:opportunity-capital",
            kind="opportunity_capital",
            priority="info",
            title="Opportunity capital",
            summary=f"€{net_worth.opportunities} is currently classified for opportunities.",
            evidence=[
                _evidence(
                    NET_WORTH_CONTRACT,
                    "current:opportunities",
                    _metric("opportunityCapital", "Opportunity capital", net_worth.opportunities, "currency"),
                    _metric("totalNetWorth", "Total net worth", net_worth.totalNetWorth, "currency"),
                )
            ],
        )
    )

    largest = account_summary.largestAccount
    if largest is not None:
        cards.append(
            AdvancedInsightCard(
                id="current:account-concentration",
                kind="account_concentration",
                priority="info",
                title="Largest account concentration",
                summary=(
                    f"{largest.name} is the largest included account"
                    + (f" at {largest.sharePercent}% of current net worth." if largest.sharePercent is not None else ".")
                ),
                evidence=[
                    _evidence(
                        NET_WORTH_CONTRACT,
                        f"account:{largest.id}",
                        _metric("account", "Account", largest.name, "text"),
                        _metric("balance", "Balance", largest.currentBalance, "currency"),
                        *(
                            [_metric("sharePercent", "Share of net worth", largest.sharePercent, "percent")]
                            if largest.sharePercent is not None
                            else []
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
        "net_worth_growth": 4,
        "net_worth_liquidity": 5,
        "emergency_coverage": 6,
        "investment_share": 7,
        "opportunity_capital": 8,
        "account_concentration": 9,
        "category_concentration": 10,
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
            "netWorth": NET_WORTH_CONTRACT,
        },
        limitations=[
            "Insights are deterministic summaries of stored account evidence and are not financial advice.",
            "Open findings reflect the latest persisted financial-intelligence scan; this endpoint does not run a new scan.",
            "The selected calendar month includes all transactions currently stored inside that month; this endpoint does not invent forecast confidence or apply an as-of cutoff.",
            "Net-worth figures come from manually maintained balances rather than live financial-institution connections.",
            "Net-worth change includes deposits, withdrawals, transfers and account additions/removals; it must not be interpreted as investment return.",
        ],
    )
