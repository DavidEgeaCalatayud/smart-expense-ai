from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from sqlalchemy.orm import Session

from app.analysis_contracts import SPENDING_FORECAST_VERSION
from app.services.historical_analysis_v2 import _load_expense_transactions
from app.services.intelligence_rules import TransactionSnapshot
from app.services.merchant_canonicalization import build_merchant_identity_map
from app.services.recurring_streams_v2_2 import (
    build_recurring_profiles_v2_2,
    build_recurring_streams_v2_2,
)
from app.services.upcoming_payments import project_upcoming_payments
from app.spending_forecast_schemas import (
    ForecastBacktestMetrics,
    SpendingForecastBaseline,
    SpendingForecastResponse,
)


MONEY_CENT = Decimal("0.01")
RATIO_THOUSANDTH = Decimal("0.001")
PERCENT_HUNDRED = Decimal("100")
BACKTEST_CUTOFF_DAY = 15


@dataclass(frozen=True)
class _BaselineCalculation:
    baseline: str
    label: str
    available: bool
    projected: Decimal | None
    assumptions: tuple[str, ...]
    evidence: dict[str, str | int]


def _money(value: Decimal) -> str:
    return format(value.quantize(MONEY_CENT, rounding=ROUND_HALF_UP), "f")


def _ratio(value: Decimal) -> str:
    return format(value.quantize(RATIO_THOUSANDTH, rounding=ROUND_HALF_UP), "f")


def _month_start(value: date) -> date:
    return value.replace(day=1)


def _month_end(value: date) -> date:
    return value.replace(day=monthrange(value.year, value.month)[1])


def _month_index(value: date) -> int:
    return value.year * 12 + value.month - 1


def _month_from_index(value: int) -> date:
    year, month_index = divmod(value, 12)
    return date(year, month_index + 1, 1)


def _shift_month(value: date, offset: int) -> date:
    return _month_from_index(_month_index(_month_start(value)) + offset)


def _month_total(
    transactions: list[TransactionSnapshot],
    month: date,
    *,
    through: date | None = None,
) -> Decimal:
    start = _month_start(month)
    end = _month_end(month) if through is None else min(through, _month_end(month))
    return sum(
        (
            item.amount
            for item in transactions
            if start <= item.transaction_date <= end
        ),
        Decimal("0"),
    )


def _history_covers_month(transactions: list[TransactionSnapshot], month: date) -> bool:
    if not transactions:
        return False
    earliest = min(item.transaction_date for item in transactions)
    return earliest <= _month_start(month)


def _three_month_mean(
    transactions: list[TransactionSnapshot],
    as_of: date,
) -> tuple[Decimal | None, list[Decimal]]:
    first_month = _shift_month(as_of, -3)
    if not _history_covers_month(transactions, first_month):
        return None, []
    totals = [
        _month_total(transactions, _shift_month(as_of, offset))
        for offset in (-3, -2, -1)
    ]
    return sum(totals, Decimal("0")) / Decimal("3"), totals


def _qualified_recurring_transaction_ids(
    transactions: list[TransactionSnapshot],
    *,
    as_of: date,
) -> set[str]:
    eligible = [item for item in transactions if item.transaction_date <= as_of]
    if not eligible:
        return set()
    identities = build_merchant_identity_map([item.merchant for item in eligible])
    profiles = build_recurring_profiles_v2_2(
        eligible,
        as_of,
        identities,
        limit=None,
    )
    qualified_keys = {str(profile["streamKey"]) for profile in profiles}
    if not qualified_keys:
        return set()
    streams = build_recurring_streams_v2_2(
        eligible,
        identities,
        analysis_end=as_of,
    )
    return {
        item.id
        for stream in streams
        if stream.stream_key in qualified_keys
        for item in stream.transactions
    }


def _calculate_baselines(
    transactions: list[TransactionSnapshot],
    *,
    as_of: date,
) -> tuple[Decimal, Decimal | None, list[_BaselineCalculation]]:
    eligible = [item for item in transactions if item.transaction_date <= as_of]
    current_start = _month_start(as_of)
    current_end = _month_end(as_of)
    days_in_month = current_end.day
    elapsed_days = as_of.day
    remaining_days = max(0, days_in_month - elapsed_days)
    spent_so_far = _month_total(eligible, current_start, through=as_of)

    historical_mean, historical_totals = _three_month_mean(eligible, as_of)
    mean_available = historical_mean is not None
    mean_calc = _BaselineCalculation(
        baseline="three_month_mean",
        label="Previous 3 complete months",
        available=mean_available,
        projected=historical_mean,
        assumptions=(
            "Uses only the three complete calendar months before the forecast month.",
            "A zero-spend month remains a real zero; partial current-month spending is excluded.",
        ),
        evidence={
            "completeMonths": len(historical_totals),
            **{
                f"month{index + 1}Total": _money(total)
                for index, total in enumerate(historical_totals)
            },
        },
    )

    run_rate = (
        spent_so_far / Decimal(elapsed_days) * Decimal(days_in_month)
        if elapsed_days > 0
        else None
    )
    run_rate_calc = _BaselineCalculation(
        baseline="run_rate",
        label="Current-month run rate",
        available=run_rate is not None,
        projected=run_rate,
        assumptions=(
            "Assumes the average daily spending observed so far continues through month end.",
            "No future transaction is used; the denominator is elapsed calendar days, including no-spend days.",
        ),
        evidence={
            "spentSoFar": _money(spent_so_far),
            "elapsedDays": elapsed_days,
            "daysInMonth": days_in_month,
        },
    )

    recurring_ids = _qualified_recurring_transaction_ids(eligible, as_of=as_of)
    recurring_spent = sum(
        (
            item.amount
            for item in eligible
            if current_start <= item.transaction_date <= as_of and item.id in recurring_ids
        ),
        Decimal("0"),
    )
    variable_spent = max(Decimal("0"), spent_so_far - recurring_spent)
    variable_remaining = (
        variable_spent / Decimal(elapsed_days) * Decimal(remaining_days)
        if elapsed_days > 0 and remaining_days > 0
        else Decimal("0")
    )

    future_recurring = Decimal("0")
    future_recurring_count = 0
    if remaining_days > 0:
        projection = project_upcoming_payments(
            eligible,
            as_of=as_of,
            window_start=as_of + timedelta(days=1),
            days=remaining_days,
        )
        future_recurring = Decimal(projection.expectedTotal)
        future_recurring_count = projection.upcomingCount

    recurrence_aware = spent_so_far + variable_remaining + future_recurring
    recurrence_calc = _BaselineCalculation(
        baseline="recurrence_aware",
        label="Recurrence-aware projection",
        available=True,
        projected=recurrence_aware,
        assumptions=(
            "Keeps spending already observed this month exactly once.",
            "Projects only non-recurring spending at its observed daily run rate.",
            "Adds future qualified recurring occurrences from recurring-calendar-v1 through month end.",
            "Recurring identity is learned from historical-v2.2/lifecycle-v1 streams, not from future rows.",
        ),
        evidence={
            "spentSoFar": _money(spent_so_far),
            "recurringSpentSoFar": _money(recurring_spent),
            "variableSpentSoFar": _money(variable_spent),
            "projectedVariableRemaining": _money(variable_remaining),
            "expectedRecurringRemaining": _money(future_recurring),
            "expectedRecurringOccurrences": future_recurring_count,
            "remainingDays": remaining_days,
        },
    )
    return spent_so_far, historical_mean, [mean_calc, run_rate_calc, recurrence_calc]


def _smape(predicted: Decimal, actual: Decimal) -> Decimal:
    denominator = abs(predicted) + abs(actual)
    if denominator == 0:
        return Decimal("0")
    return Decimal("2") * abs(predicted - actual) / denominator * PERCENT_HUNDRED


def _metrics(
    values: list[tuple[Decimal, Decimal]],
    *,
    cutoff_day: int,
) -> ForecastBacktestMetrics:
    if not values:
        return ForecastBacktestMetrics(
            support=0,
            cutoffDay=cutoff_day,
            mae=None,
            smapePercent=None,
            bias=None,
        )
    support = Decimal(len(values))
    absolute_errors = [abs(predicted - actual) for predicted, actual in values]
    signed_errors = [predicted - actual for predicted, actual in values]
    smapes = [_smape(predicted, actual) for predicted, actual in values]
    return ForecastBacktestMetrics(
        support=len(values),
        cutoffDay=cutoff_day,
        mae=_money(sum(absolute_errors, Decimal("0")) / support),
        smapePercent=_ratio(sum(smapes, Decimal("0")) / support),
        bias=_money(sum(signed_errors, Decimal("0")) / support),
    )


def backtest_spending_forecasts(
    transactions: list[TransactionSnapshot],
    *,
    as_of: date,
    cutoff_day: int = BACKTEST_CUTOFF_DAY,
) -> dict[str, ForecastBacktestMetrics]:
    """Walk forward over complete months using the same fixed within-month cutoff.

    All three baselines are scored on the same folds. A fold enters evaluation only when
    the three preceding complete months are observable, which guarantees equal support and
    makes future baseline/ML challenger comparisons meaningful.
    """
    if cutoff_day < 1 or cutoff_day > 28:
        raise ValueError("cutoff_day must be between 1 and 28")
    if not transactions:
        empty = _metrics([], cutoff_day=cutoff_day)
        return {
            "three_month_mean": empty,
            "run_rate": empty.model_copy(),
            "recurrence_aware": empty.model_copy(),
        }

    first_month = _month_start(min(item.transaction_date for item in transactions))
    last_complete_month = _shift_month(as_of, -1)
    target = _shift_month(first_month, 3)
    observations: dict[str, list[tuple[Decimal, Decimal]]] = {
        "three_month_mean": [],
        "run_rate": [],
        "recurrence_aware": [],
    }

    while target <= last_complete_month:
        cutoff = target.replace(day=cutoff_day)
        _, _, calculations = _calculate_baselines(transactions, as_of=cutoff)
        if all(calculation.available and calculation.projected is not None for calculation in calculations):
            actual = _month_total(transactions, target)
            for calculation in calculations:
                observations[calculation.baseline].append((calculation.projected or Decimal("0"), actual))
        target = _shift_month(target, 1)

    return {
        baseline: _metrics(values, cutoff_day=cutoff_day)
        for baseline, values in observations.items()
    }


def build_spending_forecast(
    transactions: list[TransactionSnapshot],
    *,
    as_of: date,
) -> SpendingForecastResponse:
    spent_so_far, historical_mean, calculations = _calculate_baselines(
        transactions,
        as_of=as_of,
    )
    backtests = backtest_spending_forecasts(transactions, as_of=as_of)
    historical_mean_string = _money(historical_mean) if historical_mean is not None else None

    baselines = [
        SpendingForecastBaseline(
            baseline=calculation.baseline,  # type: ignore[arg-type]
            label=calculation.label,
            available=calculation.available,
            projectedMonthEnd=(
                _money(calculation.projected)
                if calculation.available and calculation.projected is not None
                else None
            ),
            differenceFromThreeMonthMean=(
                _money(calculation.projected - historical_mean)
                if calculation.available
                and calculation.projected is not None
                and historical_mean is not None
                else None
            ),
            assumptions=list(calculation.assumptions),
            evidence=calculation.evidence,
            backtest=backtests[calculation.baseline],
        )
        for calculation in calculations
    ]
    return SpendingForecastResponse(
        forecastVersion=SPENDING_FORECAST_VERSION,
        asOf=as_of.isoformat(),
        month=as_of.strftime("%Y-%m"),
        daysInMonth=_month_end(as_of).day,
        elapsedDays=as_of.day,
        remainingDays=max(0, _month_end(as_of).day - as_of.day),
        spentSoFar=_money(spent_so_far),
        historicalThreeMonthMean=historical_mean_string,
        backtestCutoffDay=BACKTEST_CUTOFF_DAY,
        backtestMonths=baselines[0].backtest.support,
        baselines=baselines,
    )


def get_spending_forecast(
    db: Session,
    user_id: UUID,
    *,
    as_of: date | None = None,
) -> SpendingForecastResponse:
    effective_date = as_of or date.today()
    return build_spending_forecast(
        _load_expense_transactions(db, user_id),
        as_of=effective_date,
    )
