from __future__ import annotations

from collections import defaultdict
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
from app.services.intelligence_rules import TransactionSnapshot, normalize_merchant


ANALYSIS_VERSION = "historical-v1"
MONEY_CENT = Decimal("0.01")
ONE = Decimal("1")
ZERO = Decimal("0")
SCORE_HUNDRED = Decimal("100")


def _money(value: Decimal) -> str:
    return format(value.quantize(MONEY_CENT, rounding=ROUND_HALF_UP), "f")


def _ratio(value: Decimal, places: str = "0.001") -> str:
    return format(value.quantize(Decimal(places), rounding=ROUND_HALF_UP), "f")


def _month_start(value: date) -> date:
    return date(value.year, value.month, 1)


def _shift_month(value: date, offset: int) -> date:
    absolute = value.year * 12 + (value.month - 1) + offset
    year, month_index = divmod(absolute, 12)
    return date(year, month_index + 1, 1)


def _month_keys(start: date, months: int) -> list[str]:
    return [_shift_month(start, offset).strftime("%Y-%m") for offset in range(months)]


def _median_decimal(values: list[Decimal]) -> Decimal:
    result = median(values)
    return result if isinstance(result, Decimal) else Decimal(str(result))


def _median_number(values: list[int]) -> Decimal:
    result = median(values)
    return Decimal(str(result))


def _classify_cadence(interval_days: Decimal) -> tuple[str, int, int] | None:
    cadences = (
        ("weekly", 5, 9),
        ("biweekly", 12, 16),
        ("monthly", 25, 35),
        ("quarterly", 80, 100),
        ("yearly", 350, 380),
    )
    for name, lower, upper in cadences:
        if Decimal(lower) <= interval_days <= Decimal(upper):
            return name, lower, upper
    return None


def _linear_trend(monthly_amounts: list[Decimal]) -> dict[str, object]:
    active_months = sum(amount > ZERO for amount in monthly_amounts)
    if not monthly_amounts:
        return {
            "direction": "insufficient_data",
            "monthlySlope": "0.00",
            "averageMonthlySpend": "0.00",
            "rSquared": "0.000",
            "activeMonths": 0,
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
    slope = ss_xy / ss_xx if ss_xx != ZERO else ZERO
    intercept = y_mean - slope * x_mean

    ss_total = sum(((value - y_mean) ** 2 for value in monthly_amounts), ZERO)
    ss_residual = sum(
        (
            (y_value - (intercept + slope * x_value)) ** 2
            for x_value, y_value in zip(x_values, monthly_amounts)
        ),
        ZERO,
    )
    if ss_total == ZERO:
        r_squared = ZERO
    else:
        r_squared = max(ZERO, min(ONE, ONE - (ss_residual / ss_total)))

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


def _recurring_profiles(transactions: list[TransactionSnapshot]) -> list[dict[str, object]]:
    groups: dict[str, list[TransactionSnapshot]] = defaultdict(list)
    for transaction in transactions:
        merchant_key = normalize_merchant(transaction.merchant)
        if merchant_key:
            groups[merchant_key].append(transaction)

    profiles: list[dict[str, object]] = []
    for group in groups.values():
        ordered = sorted(group, key=lambda item: (item.transaction_date, item.id))
        unique_dates = sorted({item.transaction_date for item in ordered})
        if len(unique_dates) < 3:
            continue

        intervals = [(current - previous).days for previous, current in zip(unique_dates, unique_dates[1:])]
        typical_interval = _median_number(intervals)
        cadence = _classify_cadence(typical_interval)
        if cadence is None:
            continue
        cadence_name, lower, upper = cadence

        interval_deviations = [abs(Decimal(interval) - typical_interval) for interval in intervals]
        interval_mad = _median_decimal(interval_deviations)
        interval_regularity = max(ZERO, ONE - min(ONE, interval_mad / max(typical_interval, ONE)))
        cadence_fit = Decimal(sum(lower <= interval <= upper for interval in intervals)) / Decimal(len(intervals))

        amounts = [item.amount for item in ordered]
        typical_amount = _median_decimal(amounts)
        if typical_amount <= ZERO:
            continue
        amount_mad = _median_decimal([abs(amount - typical_amount) for amount in amounts])
        amount_stability = max(ZERO, ONE - min(ONE, amount_mad / typical_amount))
        history_depth = min(ONE, Decimal(len(unique_dates) - 2) / Decimal("4"))

        pattern_score = SCORE_HUNDRED * (
            Decimal("0.45") * cadence_fit
            + Decimal("0.25") * interval_regularity
            + Decimal("0.20") * amount_stability
            + Decimal("0.10") * history_depth
        )
        if pattern_score < Decimal("55"):
            continue

        next_expected = unique_dates[-1] + timedelta(
            days=int(typical_interval.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        )
        profiles.append(
            {
                "merchant": ordered[-1].merchant,
                "cadence": cadence_name,
                "occurrenceCount": len(unique_dates),
                "medianAmount": _money(typical_amount),
                "medianIntervalDays": _ratio(typical_interval, "0.1"),
                "intervalRegularity": _ratio(interval_regularity),
                "amountStability": _ratio(amount_stability),
                "cadenceFit": _ratio(cadence_fit),
                "historyDepth": _ratio(history_depth),
                "patternScore": _ratio(pattern_score, "0.1"),
                "nextExpectedDate": next_expected.isoformat(),
            }
        )

    return sorted(
        profiles,
        key=lambda item: (-Decimal(str(item["patternScore"])), str(item["merchant"]).lower()),
    )[:8]


def _historical_outliers(
    all_transactions: list[TransactionSnapshot],
    period_start: date,
    period_end: date,
) -> list[dict[str, object]]:
    merchant_history: dict[str, list[Decimal]] = defaultdict(list)
    category_history: dict[str, list[Decimal]] = defaultdict(list)
    outliers: list[dict[str, object]] = []

    ordered = sorted(all_transactions, key=lambda item: (item.transaction_date, item.id))
    for transaction in ordered:
        merchant_key = normalize_merchant(transaction.merchant)
        merchant_amounts = merchant_history[merchant_key][-12:] if merchant_key else []
        category_amounts = category_history[transaction.category][-20:]

        baseline_scope: str | None = None
        baseline_values: list[Decimal] = []
        if len(merchant_amounts) >= 4:
            baseline_scope = "merchant"
            baseline_values = merchant_amounts
        elif len(category_amounts) >= 8:
            baseline_scope = "category"
            baseline_values = category_amounts

        in_period = period_start <= transaction.transaction_date <= period_end
        if in_period and baseline_scope is not None:
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

        if merchant_key:
            merchant_history[merchant_key].append(transaction.amount)
        category_history[transaction.category].append(transaction.amount)

    return sorted(
        outliers,
        key=lambda item: (-Decimal(str(item["deviationScore"])), str(item["date"])),
    )[:10]


def _category_shifts(
    transactions: list[TransactionSnapshot],
    period_start: date,
    window_months: int,
) -> list[dict[str, object]]:
    month_keys = _month_keys(period_start, window_months)
    if len(month_keys) < 6:
        return []
    comparison_months = month_keys[-6:]
    previous_months = set(comparison_months[:3])
    current_months = set(comparison_months[3:])

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

        percent_change = None
        if previous_average > ZERO:
            percent_change = (delta / previous_average) * SCORE_HUNDRED

        if delta > ZERO:
            direction = "increasing"
        elif delta < ZERO:
            direction = "decreasing"
        else:
            direction = "stable"

        shifts.append(
            {
                "category": category,
                "direction": direction,
                "previousThreeMonthAverage": _money(previous_average),
                "currentThreeMonthAverage": _money(current_average),
                "delta": _money(delta),
                "percentChange": _ratio(percent_change, "0.1") if percent_change is not None else None,
            }
        )

    return sorted(shifts, key=lambda item: -abs(Decimal(str(item["delta"]))))[:6]


def analyze_historical_transactions(
    all_transactions: list[TransactionSnapshot],
    window_months: int,
) -> tuple[date, date, list[TransactionSnapshot], dict[str, object]]:
    anchor = max((transaction.transaction_date for transaction in all_transactions), default=date.today())
    period_start = _shift_month(_month_start(anchor), -(window_months - 1))
    period_end = anchor
    window_transactions = [
        transaction
        for transaction in all_transactions
        if period_start <= transaction.transaction_date <= period_end
    ]

    month_keys = _month_keys(period_start, window_months)
    monthly_totals = {month: ZERO for month in month_keys}
    for transaction in window_transactions:
        key = transaction.transaction_date.strftime("%Y-%m")
        if key in monthly_totals:
            monthly_totals[key] += transaction.amount

    monthly_spend = [
        {"month": month, "amount": _money(monthly_totals[month])}
        for month in month_keys
    ]
    trend = _linear_trend([monthly_totals[month] for month in month_keys])
    recurring_profiles = _recurring_profiles(window_transactions)
    outliers = _historical_outliers(all_transactions, period_start, period_end)
    category_shifts = _category_shifts(window_transactions, period_start, window_months)

    merchant_counts: dict[str, int] = defaultdict(int)
    category_counts: dict[str, int] = defaultdict(int)
    for transaction in window_transactions:
        merchant_key = normalize_merchant(transaction.merchant)
        if merchant_key:
            merchant_counts[merchant_key] += 1
        category_counts[transaction.category] += 1

    result: dict[str, object] = {
        "monthlySpend": monthly_spend,
        "trend": trend,
        "recurringProfiles": recurring_profiles,
        "outliers": outliers,
        "categoryShifts": category_shifts,
        "coverage": {
            "transactionCount": len(window_transactions),
            "activeMonths": int(trend["activeMonths"]),
            "merchantsWithBaseline": sum(count >= 4 for count in merchant_counts.values()),
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
    period_start, period_end, window_transactions, result = analyze_historical_transactions(
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
