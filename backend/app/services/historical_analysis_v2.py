from __future__ import annotations

from calendar import monthrange
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from statistics import median
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.models.historical_analysis import HistoricalAnalysisSnapshot
from app.models.transaction import Transaction as TransactionModel
from app.schemas import HistoricalAnalysisResponse
from app.services.intelligence_rules import TransactionSnapshot
from app.services.merchant_canonicalization import build_merchant_identity_map


ANALYSIS_VERSION = "historical-v2"
MONEY_CENT = Decimal("0.01")
ONE = Decimal("1")
ZERO = Decimal("0")
SCORE_HUNDRED = Decimal("100")


def _money(value: Decimal) -> str:
    return format(value.quantize(MONEY_CENT, rounding=ROUND_HALF_UP), "f")


def _ratio(value: Decimal, places: str = "0.001") -> str:
    return format(value.quantize(Decimal(places), rounding=ROUND_HALF_UP), "f")


def _median_decimal(values: list[Decimal]) -> Decimal:
    result = median(values)
    return result if isinstance(result, Decimal) else Decimal(str(result))


def _median_int(values: list[int]) -> Decimal:
    return Decimal(str(median(values)))


def _month_start(value: date) -> date:
    return date(value.year, value.month, 1)


def _month_index(value: date) -> int:
    return value.year * 12 + value.month - 1


def _month_from_index(value: int) -> tuple[int, int]:
    year, month_index = divmod(value, 12)
    return year, month_index + 1


def _shift_month(value: date, offset: int) -> date:
    year, month = _month_from_index(_month_index(value) + offset)
    return date(year, month, 1)


def _month_keys(start: date, months: int) -> list[str]:
    return [_shift_month(start, offset).strftime("%Y-%m") for offset in range(months)]


def _last_day(year: int, month: int) -> int:
    return monthrange(year, month)[1]


def _is_month_end(value: date) -> bool:
    return value.day == _last_day(value.year, value.month)


def _scheduled_date(month_index: int, target_day: int, month_end_pattern: bool) -> date:
    year, month = _month_from_index(month_index)
    day = _last_day(year, month) if month_end_pattern else min(target_day, _last_day(year, month))
    return date(year, month, day)


def _linear_trend(monthly_amounts: list[Decimal]) -> dict[str, object]:
    active_months = sum(amount > ZERO for amount in monthly_amounts)
    if len(monthly_amounts) < 2:
        return {
            "direction": "insufficient_data",
            "monthlySlope": "0.00",
            "averageMonthlySpend": _money(sum(monthly_amounts, ZERO) if monthly_amounts else ZERO),
            "rSquared": "0.000",
            "activeMonths": active_months,
        }

    count = Decimal(len(monthly_amounts))
    x_values = [Decimal(index) for index in range(len(monthly_amounts))]
    x_mean = sum(x_values, ZERO) / count
    y_mean = sum(monthly_amounts, ZERO) / count
    ss_xx = sum(((value - x_mean) ** 2 for value in x_values), ZERO)
    ss_xy = sum(
        ((x_value - x_mean) * (y_value - y_mean) for x_value, y_value in zip(x_values, monthly_amounts)),
        ZERO,
    )
    slope = ss_xy / ss_xx if ss_xx else ZERO
    intercept = y_mean - slope * x_mean
    ss_total = sum(((value - y_mean) ** 2 for value in monthly_amounts), ZERO)
    ss_residual = sum(
        ((y_value - (intercept + slope * x_value)) ** 2 for x_value, y_value in zip(x_values, monthly_amounts)),
        ZERO,
    )
    r_squared = ZERO if ss_total == ZERO else max(ZERO, min(ONE, ONE - ss_residual / ss_total))

    meaningful_slope = max(abs(y_mean) * Decimal("0.05"), Decimal("10.00"))
    if active_months < 3:
        direction = "insufficient_data"
    elif slope > meaningful_slope:
        direction = "increasing"
    elif slope < -meaningful_slope:
        direction = "decreasing"
    else:
        direction = "stable"

    return {
        "direction": direction,
        "monthlySlope": _money(slope),
        "averageMonthlySpend": _money(y_mean),
        "rSquared": _ratio(r_squared),
        "activeMonths": active_months,
    }


def _calendar_cadence(unique_dates: list[date]) -> tuple[str, int, Decimal] | None:
    month_gaps = [
        _month_index(current) - _month_index(previous)
        for previous, current in zip(unique_dates, unique_dates[1:])
    ]
    candidates = (("monthly", 1), ("quarterly", 3), ("yearly", 12))
    if month_gaps:
        best_name, best_step, best_fit = max(
            (
                (
                    name,
                    step,
                    Decimal(sum(gap == step for gap in month_gaps)) / Decimal(len(month_gaps)),
                )
                for name, step in candidates
            ),
            key=lambda item: item[2],
        )
        if best_fit >= Decimal("0.60"):
            return best_name, best_step, best_fit

    intervals = [(current - previous).days for previous, current in zip(unique_dates, unique_dates[1:])]
    if not intervals:
        return None
    typical = _median_int(intervals)
    for name, expected_days, lower, upper in (
        ("weekly", 7, 5, 9),
        ("biweekly", 14, 12, 16),
    ):
        if Decimal(lower) <= typical <= Decimal(upper):
            fit = Decimal(sum(lower <= interval <= upper for interval in intervals)) / Decimal(len(intervals))
            return name, expected_days, fit
    return None


def _longest_consecutive_periods(unique_dates: list[date], cadence: str, step: int) -> int:
    if not unique_dates:
        return 0
    longest = current = 1
    for previous, current_date in zip(unique_dates, unique_dates[1:]):
        if cadence in {"monthly", "quarterly", "yearly"}:
            matches = _month_index(current_date) - _month_index(previous) == step
        else:
            gap = (current_date - previous).days
            tolerance = 2 if cadence == "weekly" else 3
            matches = abs(gap - step) <= tolerance
        current = current + 1 if matches else 1
        longest = max(longest, current)
    return longest


def _calendar_schedule_features(
    unique_dates: list[date],
    cadence: str,
    step: int,
    analysis_end: date,
) -> tuple[date, int, bool, Decimal, Decimal, Decimal]:
    days = [value.day for value in unique_dates]
    month_end_fit = Decimal(sum(_is_month_end(value) for value in unique_dates)) / Decimal(len(unique_dates))
    target_day = int(_median_int(days).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    month_end_pattern = month_end_fit >= Decimal("0.60")

    day_mad = _median_decimal([abs(Decimal(day) - Decimal(target_day)) for day in days])
    day_of_month_stability = month_end_fit if month_end_pattern else max(
        ZERO, ONE - min(ONE, day_mad / Decimal("7"))
    )
    weekday_counts = Counter(value.weekday() for value in unique_dates)
    day_of_week_stability = Decimal(max(weekday_counts.values())) / Decimal(len(unique_dates))

    last_occurrence = unique_dates[-1]
    if cadence in {"monthly", "quarterly", "yearly"}:
        next_month_index = _month_index(last_occurrence) + step
        next_expected = _scheduled_date(next_month_index, target_day, month_end_pattern)
        actual_by_month: dict[int, list[date]] = defaultdict(list)
        for value in unique_dates:
            actual_by_month[_month_index(value)].append(value)

        missed = 0
        first_index = _month_index(unique_dates[0])
        expected_index = first_index + step
        while expected_index <= _month_index(analysis_end):
            expected_date = _scheduled_date(expected_index, target_day, month_end_pattern)
            if expected_date + timedelta(days=5) <= analysis_end:
                actual_dates = actual_by_month.get(expected_index, [])
                matched = any(
                    (_is_month_end(actual) if month_end_pattern else abs((actual - expected_date).days) <= 4)
                    for actual in actual_dates
                )
                if not matched:
                    missed += 1
            expected_index += step
    else:
        next_expected = last_occurrence + timedelta(days=step)
        if next_expected + timedelta(days=3) <= analysis_end:
            elapsed = (analysis_end - next_expected).days
            missed = elapsed // step + 1
        else:
            missed = 0

    is_missing = next_expected + timedelta(days=5 if cadence in {"monthly", "quarterly", "yearly"} else 3) <= analysis_end
    return (
        next_expected,
        missed,
        is_missing,
        day_of_month_stability,
        month_end_fit,
        day_of_week_stability,
    )


def _recurring_profiles(
    transactions: list[TransactionSnapshot],
    analysis_end: date,
    identity_map: dict[str, object],
) -> list[dict[str, object]]:
    groups: dict[str, list[TransactionSnapshot]] = defaultdict(list)
    for transaction in transactions:
        identity = identity_map[transaction.merchant]
        canonical = getattr(identity, "canonical")
        if canonical:
            groups[canonical].append(transaction)

    profiles: list[dict[str, object]] = []
    for canonical, group in groups.items():
        ordered = sorted(group, key=lambda item: (item.transaction_date, item.id))
        unique_dates = sorted({item.transaction_date for item in ordered})
        if len(unique_dates) < 3:
            continue

        cadence_info = _calendar_cadence(unique_dates)
        if cadence_info is None:
            continue
        cadence_name, cadence_step, cadence_fit = cadence_info
        intervals = [(current - previous).days for previous, current in zip(unique_dates, unique_dates[1:])]
        typical_interval = _median_int(intervals)
        interval_mad = _median_decimal([abs(Decimal(interval) - typical_interval) for interval in intervals])
        interval_regularity = max(ZERO, ONE - min(ONE, interval_mad / max(typical_interval, ONE)))

        amounts = [item.amount for item in ordered]
        typical_amount = _median_decimal(amounts)
        if typical_amount <= ZERO:
            continue
        amount_mad = _median_decimal([abs(amount - typical_amount) for amount in amounts])
        amount_stability = max(ZERO, ONE - min(ONE, amount_mad / typical_amount))
        amount_mean = sum(amounts, ZERO) / Decimal(len(amounts))
        variance = sum(((amount - amount_mean) ** 2 for amount in amounts), ZERO) / Decimal(len(amounts))
        amount_cv = variance.sqrt() / amount_mean if amount_mean > ZERO else ONE
        cv_stability = max(ZERO, ONE - min(ONE, amount_cv))

        (
            next_expected,
            missed_expected,
            expected_payment_missing,
            day_of_month_stability,
            month_end_fit,
            day_of_week_stability,
        ) = _calendar_schedule_features(unique_dates, cadence_name, cadence_step, analysis_end)

        calendar_position_stability = (
            day_of_week_stability
            if cadence_name in {"weekly", "biweekly"}
            else day_of_month_stability
        )
        history_depth = min(ONE, Decimal(len(unique_dates) - 2) / Decimal("4"))
        consecutive_periods = _longest_consecutive_periods(unique_dates, cadence_name, cadence_step)
        consecutive_fit = min(ONE, Decimal(max(consecutive_periods - 1, 0)) / Decimal("5"))

        pattern_score = SCORE_HUNDRED * (
            Decimal("0.30") * cadence_fit
            + Decimal("0.15") * interval_regularity
            + Decimal("0.15") * calendar_position_stability
            + Decimal("0.15") * amount_stability
            + Decimal("0.10") * cv_stability
            + Decimal("0.10") * history_depth
            + Decimal("0.05") * consecutive_fit
        )
        if pattern_score < Decimal("55"):
            continue

        observed_merchants = sorted({item.merchant for item in ordered}, key=str.casefold)
        profiles.append(
            {
                "merchant": observed_merchants[-1],
                "canonicalMerchant": canonical,
                "observedMerchants": observed_merchants,
                "cadence": cadence_name,
                "occurrenceCount": len(unique_dates),
                "medianAmount": _money(typical_amount),
                "medianIntervalDays": _ratio(typical_interval, "0.1"),
                "intervalRegularity": _ratio(interval_regularity),
                "dayOfMonthStability": _ratio(day_of_month_stability),
                "monthEndFit": _ratio(month_end_fit),
                "dayOfWeekStability": _ratio(day_of_week_stability),
                "amountStability": _ratio(amount_stability),
                "amountMad": _money(amount_mad),
                "amountCv": _ratio(amount_cv),
                "cadenceFit": _ratio(cadence_fit),
                "historyDepth": _ratio(history_depth),
                "consecutivePeriods": consecutive_periods,
                "missedExpectedOccurrences": missed_expected,
                "isExpectedPaymentMissing": expected_payment_missing,
                "patternScore": _ratio(pattern_score, "0.1"),
                "nextExpectedDate": next_expected.isoformat(),
            }
        )

    return sorted(
        profiles,
        key=lambda item: (-Decimal(str(item["patternScore"])), str(item["canonicalMerchant"])),
    )[:12]


def _historical_outliers(
    all_transactions: list[TransactionSnapshot],
    period_start: date,
    period_end: date,
    identity_map: dict[str, object],
) -> list[dict[str, object]]:
    merchant_history: dict[str, list[Decimal]] = defaultdict(list)
    category_history: dict[str, list[Decimal]] = defaultdict(list)
    outliers: list[dict[str, object]] = []

    ordered = sorted(
        (item for item in all_transactions if item.transaction_date <= period_end),
        key=lambda item: (item.transaction_date, item.id),
    )
    for transaction in ordered:
        canonical = getattr(identity_map[transaction.merchant], "canonical")
        merchant_amounts = merchant_history[canonical][-12:] if canonical else []
        category_amounts = category_history[transaction.category][-20:]

        baseline_scope: str | None = None
        baseline_values: list[Decimal] = []
        if len(merchant_amounts) >= 4:
            baseline_scope = "merchant"
            baseline_values = merchant_amounts
        elif len(category_amounts) >= 8:
            baseline_scope = "category"
            baseline_values = category_amounts

        if period_start <= transaction.transaction_date <= period_end and baseline_scope is not None:
            baseline = _median_decimal(baseline_values)
            if baseline > ZERO:
                mad = _median_decimal([abs(value - baseline) for value in baseline_values])
                robust_spread = max(mad, baseline * Decimal("0.05"), Decimal("1.00"))
                delta = transaction.amount - baseline
                deviation_score = delta / robust_spread
                if (
                    deviation_score >= Decimal("3.00")
                    and delta >= Decimal("20.00")
                    and transaction.amount >= baseline * Decimal("1.50")
                ):
                    outliers.append(
                        {
                            "transactionId": transaction.id,
                            "merchant": transaction.merchant,
                            "canonicalMerchant": canonical,
                            "category": transaction.category,
                            "date": transaction.transaction_date.isoformat(),
                            "amount": _money(transaction.amount),
                            "baselineScope": baseline_scope,
                            "baselineCount": len(baseline_values),
                            "baselineMedian": _money(baseline),
                            "robustSpread": _money(robust_spread),
                            "deviationScore": _ratio(deviation_score, "0.01"),
                        }
                    )

        if canonical:
            merchant_history[canonical].append(transaction.amount)
        category_history[transaction.category].append(transaction.amount)

    return sorted(
        outliers,
        key=lambda item: (-Decimal(str(item["deviationScore"])), str(item["date"])),
    )[:12]


def _category_shifts(
    transactions: list[TransactionSnapshot],
    complete_month_keys: list[str],
) -> list[dict[str, object]]:
    if len(complete_month_keys) < 6:
        return []
    comparison_months = complete_month_keys[-6:]
    previous_months = comparison_months[:3]
    current_months = comparison_months[3:]

    monthly_by_category: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(lambda: ZERO))
    for transaction in transactions:
        key = transaction.transaction_date.strftime("%Y-%m")
        if key in comparison_months:
            monthly_by_category[transaction.category][key] += transaction.amount

    shifts: list[dict[str, object]] = []
    for category, values in monthly_by_category.items():
        previous_average = sum((values[month] for month in previous_months), ZERO) / Decimal("3")
        current_average = sum((values[month] for month in current_months), ZERO) / Decimal("3")
        delta = current_average - previous_average
        if abs(delta) < Decimal("10.00"):
            continue
        percent_change = (delta / previous_average) * SCORE_HUNDRED if previous_average > ZERO else None
        shifts.append(
            {
                "category": category,
                "direction": "increasing" if delta > ZERO else "decreasing",
                "previousThreeMonthAverage": _money(previous_average),
                "currentThreeMonthAverage": _money(current_average),
                "delta": _money(delta),
                "percentChange": _ratio(percent_change, "0.1") if percent_change is not None else None,
                "comparisonMonths": comparison_months,
            }
        )
    return sorted(shifts, key=lambda item: -abs(Decimal(str(item["delta"]))))[:8]


def analyze_historical_transactions_v2(
    all_transactions: list[TransactionSnapshot],
    window_months: int,
    *,
    analysis_end: date | None = None,
) -> tuple[date, date, list[TransactionSnapshot], dict[str, object]]:
    latest_transaction = max((item.transaction_date for item in all_transactions), default=date.today())
    anchor = analysis_end or latest_transaction
    period_start = _shift_month(_month_start(anchor), -(window_months - 1))
    period_end = anchor
    eligible_transactions = [item for item in all_transactions if item.transaction_date <= period_end]
    window_transactions = [
        item for item in eligible_transactions if period_start <= item.transaction_date <= period_end
    ]

    identity_map = build_merchant_identity_map([item.merchant for item in eligible_transactions])
    month_keys = _month_keys(period_start, window_months)
    monthly_totals = {month: ZERO for month in month_keys}
    for transaction in window_transactions:
        key = transaction.transaction_date.strftime("%Y-%m")
        if key in monthly_totals:
            monthly_totals[key] += transaction.amount

    anchor_key = anchor.strftime("%Y-%m")
    partial_month_key = None if _is_month_end(anchor) else anchor_key
    complete_month_keys = [month for month in month_keys if month != partial_month_key]
    monthly_spend: list[dict[str, object]] = []
    for month in month_keys:
        year, month_number = (int(part) for part in month.split("-"))
        days_in_month = _last_day(year, month_number)
        is_complete = month != partial_month_key
        days_observed = anchor.day if month == anchor_key and not is_complete else days_in_month
        monthly_spend.append(
            {
                "month": month,
                "amount": _money(monthly_totals[month]),
                "isComplete": is_complete,
                "daysObserved": days_observed,
                "daysInMonth": days_in_month,
            }
        )

    trend = _linear_trend([monthly_totals[month] for month in complete_month_keys])
    trend["completeMonthsUsed"] = len(complete_month_keys)
    trend["excludedPartialMonth"] = partial_month_key
    recurring_profiles = _recurring_profiles(window_transactions, period_end, identity_map)
    outliers = _historical_outliers(eligible_transactions, period_start, period_end, identity_map)
    category_shifts = _category_shifts(window_transactions, complete_month_keys)

    canonical_counts: dict[str, int] = defaultdict(int)
    category_counts: dict[str, int] = defaultdict(int)
    for transaction in window_transactions:
        canonical = getattr(identity_map[transaction.merchant], "canonical")
        if canonical:
            canonical_counts[canonical] += 1
        category_counts[transaction.category] += 1

    result: dict[str, object] = {
        "monthlySpend": monthly_spend,
        "monthCompleteness": {
            "strategy": "exclude_partial",
            "partialMonth": partial_month_key,
            "completeMonthsUsed": len(complete_month_keys),
            "reason": (
                "The dataset cutoff falls before calendar month-end, so that month is displayed but excluded from trend and category-shift windows."
                if partial_month_key
                else "The dataset cutoff is calendar month-end; all months in the selected window are complete."
            ),
        },
        "trend": trend,
        "recurringProfiles": recurring_profiles,
        "outliers": outliers,
        "categoryShifts": category_shifts,
        "coverage": {
            "transactionCount": len(window_transactions),
            "activeMonths": int(trend["activeMonths"]),
            "completeMonths": len(complete_month_keys),
            "partialMonthsExcluded": 1 if partial_month_key else 0,
            "canonicalMerchants": len(canonical_counts),
            "merchantsWithBaseline": sum(count >= 4 for count in canonical_counts.values()),
            "categoriesWithBaseline": sum(count >= 8 for count in category_counts.values()),
            "recurringProfiles": len(recurring_profiles),
            "outlierCount": len(outliers),
        },
    }
    return period_start, period_end, window_transactions, result


def _load_expense_transactions(db: Session, user_id: UUID) -> list[TransactionSnapshot]:
    transactions = db.scalars(
        select(TransactionModel)
        .options(joinedload(TransactionModel.category))
        .where(
            TransactionModel.user_id == user_id,
            TransactionModel.transaction_type == "expense",
        )
        .order_by(TransactionModel.transaction_date.asc(), TransactionModel.created_at.asc())
    ).all()
    return [
        TransactionSnapshot(
            id=str(transaction.id),
            merchant=transaction.merchant,
            amount=transaction.amount,
            transaction_date=transaction.transaction_date,
            category=transaction.category.name,
        )
        for transaction in transactions
    ]


def _commit(db: Session) -> None:
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise


def _snapshot_response(snapshot: HistoricalAnalysisSnapshot) -> HistoricalAnalysisResponse:
    result = snapshot.result
    return HistoricalAnalysisResponse(
        snapshotId=str(snapshot.id),
        analysisVersion=snapshot.analysis_version,
        windowMonths=snapshot.window_months,
        periodStart=snapshot.period_start.isoformat(),
        periodEnd=snapshot.period_end.isoformat(),
        analyzedTransactions=snapshot.transaction_count,
        generatedAt=snapshot.created_at,
        monthlySpend=result.get("monthlySpend", []),
        monthCompleteness=result.get(
            "monthCompleteness",
            {
                "strategy": "legacy_unknown",
                "partialMonth": None,
                "completeMonthsUsed": snapshot.window_months,
                "reason": "This snapshot predates explicit month-completeness metadata.",
            },
        ),
        trend=result.get("trend", {}),
        recurringProfiles=result.get("recurringProfiles", []),
        outliers=result.get("outliers", []),
        categoryShifts=result.get("categoryShifts", []),
        coverage=result.get("coverage", {}),
    )


def run_historical_analysis(
    db: Session,
    user_id: UUID,
    *,
    window_months: int = 12,
) -> HistoricalAnalysisResponse:
    all_transactions = _load_expense_transactions(db, user_id)
    period_start, period_end, window_transactions, result = analyze_historical_transactions_v2(
        all_transactions,
        window_months,
    )
    snapshot = HistoricalAnalysisSnapshot(
        user_id=user_id,
        analysis_version=ANALYSIS_VERSION,
        window_months=window_months,
        transaction_count=len(window_transactions),
        period_start=period_start,
        period_end=period_end,
        result=result,
        created_at=datetime.now(timezone.utc),
    )
    db.add(snapshot)
    _commit(db)
    return _snapshot_response(snapshot)


def get_latest_historical_analysis(
    db: Session,
    user_id: UUID,
) -> HistoricalAnalysisResponse | None:
    snapshot = db.scalar(
        select(HistoricalAnalysisSnapshot)
        .where(HistoricalAnalysisSnapshot.user_id == user_id)
        .order_by(HistoricalAnalysisSnapshot.created_at.desc())
        .limit(1)
    )
    return _snapshot_response(snapshot) if snapshot is not None else None
