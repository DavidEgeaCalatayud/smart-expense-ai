from datetime import date
from decimal import Decimal

from app.analysis_contracts import SPENDING_FORECAST_VERSION
from app.services.intelligence_rules import TransactionSnapshot
from app.services.spending_forecast import (
    BACKTEST_CUTOFF_DAY,
    backtest_spending_forecasts,
    build_spending_forecast,
)


def _tx(identifier: str, merchant: str, amount: str, value: date) -> TransactionSnapshot:
    return TransactionSnapshot(
        id=identifier,
        merchant=merchant,
        amount=Decimal(amount),
        transaction_date=value,
        category="Shopping",
    )


def _baseline(report, baseline: str):
    return next(item for item in report.baselines if item.baseline == baseline)


def test_three_month_mean_and_run_rate_are_exact_and_causal() -> None:
    transactions = [
        _tx("a1", "Market", "300.00", date(2026, 1, 5)),
        _tx("a2", "Market", "300.00", date(2026, 2, 5)),
        _tx("a3", "Market", "300.00", date(2026, 3, 5)),
        _tx("a4", "Market", "100.00", date(2026, 4, 10)),
        # This row is deliberately after the forecast cutoff and must never enter the forecast.
        _tx("future", "Market", "9999.00", date(2026, 4, 20)),
    ]

    report = build_spending_forecast(transactions, as_of=date(2026, 4, 10))

    assert report.forecastVersion == SPENDING_FORECAST_VERSION == "spending-forecast-v1"
    assert report.spentSoFar == "100.00"
    assert report.historicalThreeMonthMean == "300.00"
    assert _baseline(report, "three_month_mean").projectedMonthEnd == "300.00"
    assert _baseline(report, "run_rate").projectedMonthEnd == "300.00"
    assert "9999.00" not in str(report.model_dump())


def test_recurrence_aware_baseline_does_not_double_count_a_charge_already_paid() -> None:
    transactions = [
        _tx("s1", "Cloud Plan", "10.00", date(2026, 1, 5)),
        _tx("v1", "Variable Shop", "100.00", date(2026, 1, 10)),
        _tx("s2", "Cloud Plan", "10.00", date(2026, 2, 5)),
        _tx("v2", "Variable Shop", "100.00", date(2026, 2, 10)),
        _tx("s3", "Cloud Plan", "10.00", date(2026, 3, 5)),
        _tx("v3", "Variable Shop", "100.00", date(2026, 3, 10)),
        _tx("s4", "Cloud Plan", "10.00", date(2026, 4, 5)),
        _tx("v4", "Variable Shop", "100.00", date(2026, 4, 10)),
    ]

    report = build_spending_forecast(transactions, as_of=date(2026, 4, 10))
    recurrence = _baseline(report, "recurrence_aware")

    assert report.spentSoFar == "110.00"
    assert recurrence.projectedMonthEnd == "320.00"
    assert recurrence.evidence["recurringSpentSoFar"] == "10.00"
    assert recurrence.evidence["variableSpentSoFar"] == "100.00"
    assert recurrence.evidence["projectedVariableRemaining"] == "200.00"
    assert recurrence.evidence["expectedRecurringRemaining"] == "0.00"


def test_recurrence_aware_baseline_adds_only_future_qualified_occurrences() -> None:
    transactions = [
        _tx("s1", "Cloud Plan", "10.00", date(2026, 1, 20)),
        _tx("s2", "Cloud Plan", "10.00", date(2026, 2, 20)),
        _tx("s3", "Cloud Plan", "10.00", date(2026, 3, 20)),
        _tx("v1", "Variable Shop", "100.00", date(2026, 4, 10)),
    ]

    report = build_spending_forecast(transactions, as_of=date(2026, 4, 10))
    recurrence = _baseline(report, "recurrence_aware")

    assert recurrence.evidence["expectedRecurringRemaining"] == "10.00"
    assert recurrence.evidence["expectedRecurringOccurrences"] == 1
    assert recurrence.projectedMonthEnd == "310.00"


def test_walk_forward_backtest_uses_same_fixed_cutoff_and_support_for_every_baseline() -> None:
    transactions: list[TransactionSnapshot] = []
    identifier = 0
    for year, month in [
        (2025, 10),
        (2025, 11),
        (2025, 12),
        (2026, 1),
        (2026, 2),
        (2026, 3),
        (2026, 4),
        (2026, 5),
        (2026, 6),
        (2026, 7),
    ]:
        identifier += 1
        transactions.append(
            _tx(f"{identifier}-early", "Daily Spend", "150.00", date(year, month, 10))
        )
        transactions.append(
            _tx(f"{identifier}-late", "Daily Spend", "150.00", date(year, month, 20))
        )

    metrics = backtest_spending_forecasts(
        transactions,
        as_of=date(2026, 8, 27),
    )

    supports = {metric.support for metric in metrics.values()}
    assert supports == {7}
    assert all(metric.cutoffDay == BACKTEST_CUTOFF_DAY == 15 for metric in metrics.values())
    assert all(metric.mae is not None for metric in metrics.values())
    assert all(metric.smapePercent is not None for metric in metrics.values())
    assert all(metric.bias is not None for metric in metrics.values())
