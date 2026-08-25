from __future__ import annotations

from calendar import monthrange
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from statistics import median

from app.services.intelligence_rules import TransactionSnapshot
from app.services.merchant_canonicalization import MerchantIdentity, merchant_stream_hint


MIN_AMOUNT_TOLERANCE = Decimal("1.00")
AMOUNT_TOLERANCE_RATIO = Decimal("0.12")
DESCRIPTOR_AMOUNT_TOLERANCE_RATIO = Decimal("0.25")
MIN_CADENCE_FIT = Decimal("0.60")
ONE = Decimal("1")
ZERO = Decimal("0")
SCORE_HUNDRED = Decimal("100")


@dataclass(frozen=True)
class RecurringStream:
    stream_key: str
    canonical_merchant: str
    descriptor: str
    transactions: tuple[TransactionSnapshot, ...]


def _median_decimal(values: list[Decimal]) -> Decimal:
    result = median(values)
    return result if isinstance(result, Decimal) else Decimal(str(result))


def _median_int(values: list[int]) -> Decimal:
    return Decimal(str(median(values)))


def _median_amount(transactions: list[TransactionSnapshot]) -> Decimal:
    return _median_decimal([item.amount for item in transactions])


def _money(value: Decimal) -> str:
    return format(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP), "f")


def _ratio(value: Decimal, places: str = "0.001") -> str:
    return format(value.quantize(Decimal(places), rounding=ROUND_HALF_UP), "f")


def _amount_matches(amount: Decimal, centre: Decimal, *, descriptor_match: bool) -> bool:
    ratio = DESCRIPTOR_AMOUNT_TOLERANCE_RATIO if descriptor_match else AMOUNT_TOLERANCE_RATIO
    tolerance = max(MIN_AMOUNT_TOLERANCE, centre * ratio)
    return abs(amount - centre) <= tolerance


def _amount_key(value: Decimal) -> str:
    cents = int((value * Decimal("100")).quantize(Decimal("1")))
    return f"amount-{cents}"


def _month_index(value: date) -> int:
    return value.year * 12 + value.month - 1


def _month_from_index(value: int) -> tuple[int, int]:
    year, month_index = divmod(value, 12)
    return year, month_index + 1


def _last_day(year: int, month: int) -> int:
    return monthrange(year, month)[1]


def _is_month_end(value: date) -> bool:
    return value.day == _last_day(value.year, value.month)


def _scheduled_date(month_index: int, target_day: int, month_end_pattern: bool) -> date:
    year, month = _month_from_index(month_index)
    day = _last_day(year, month) if month_end_pattern else min(target_day, _last_day(year, month))
    return date(year, month, day)


def build_recurring_streams(
    transactions: list[TransactionSnapshot],
    identity_map: dict[str, MerchantIdentity],
) -> list[RecurringStream]:
    """Segment one canonical merchant into independent descriptor/amount streams.

    Merchant identity answers *who was paid*. This layer answers *which repeated payment
    series inside that merchant* a transaction most plausibly belongs to. Descriptor hints
    are preferred when available; otherwise conservative amount bands separate unrelated
    charges. The clustering is deterministic for the history supplied to the function.
    """

    by_merchant: dict[str, list[TransactionSnapshot]] = {}
    for transaction in sorted(transactions, key=lambda item: (item.transaction_date, item.id)):
        canonical = identity_map[transaction.merchant].canonical
        if canonical:
            by_merchant.setdefault(canonical, []).append(transaction)

    streams: list[RecurringStream] = []
    for canonical, merchant_transactions in sorted(by_merchant.items()):
        clusters: list[dict[str, object]] = []

        for transaction in merchant_transactions:
            descriptor = merchant_stream_hint(transaction.merchant, canonical)
            best_index: int | None = None
            best_distance: Decimal | None = None

            for index, cluster in enumerate(clusters):
                cluster_transactions = cluster["transactions"]
                assert isinstance(cluster_transactions, list)
                centre = _median_amount(cluster_transactions)
                cluster_descriptor = str(cluster["descriptor"])
                descriptor_match = bool(descriptor and cluster_descriptor and descriptor == cluster_descriptor)

                if descriptor and cluster_descriptor and descriptor != cluster_descriptor:
                    continue
                if not _amount_matches(transaction.amount, centre, descriptor_match=descriptor_match):
                    continue

                distance = abs(transaction.amount - centre)
                if best_distance is None or distance < best_distance:
                    best_index = index
                    best_distance = distance

            if best_index is None:
                clusters.append(
                    {
                        "descriptor": descriptor,
                        "seedAmount": transaction.amount,
                        "transactions": [transaction],
                    }
                )
            else:
                cluster_transactions = clusters[best_index]["transactions"]
                assert isinstance(cluster_transactions, list)
                cluster_transactions.append(transaction)
                if not clusters[best_index]["descriptor"] and descriptor:
                    clusters[best_index]["descriptor"] = descriptor

        descriptor_counts: dict[str, int] = {}
        for cluster in clusters:
            descriptor = str(cluster["descriptor"])
            descriptor_counts[descriptor] = descriptor_counts.get(descriptor, 0) + 1

        for cluster in clusters:
            cluster_transactions = cluster["transactions"]
            assert isinstance(cluster_transactions, list)
            descriptor = str(cluster["descriptor"])
            seed_amount = cluster["seedAmount"]
            assert isinstance(seed_amount, Decimal)

            if descriptor and descriptor_counts[descriptor] == 1:
                suffix = descriptor.replace(" ", "-")
            elif descriptor:
                suffix = f"{descriptor.replace(' ', '-')}-{_amount_key(seed_amount)}"
            elif len(clusters) == 1:
                suffix = "default"
            else:
                suffix = _amount_key(seed_amount)

            streams.append(
                RecurringStream(
                    stream_key=f"{canonical}::{suffix}",
                    canonical_merchant=canonical,
                    descriptor=descriptor,
                    transactions=tuple(cluster_transactions),
                )
            )

    return sorted(streams, key=lambda item: (item.canonical_merchant, item.stream_key))


def _calendar_cadence(unique_dates: list[date]) -> tuple[str, int, Decimal] | None:
    month_gaps = [
        _month_index(current) - _month_index(previous)
        for previous, current in zip(unique_dates, unique_dates[1:])
    ]
    candidates = (("monthly", 1), ("quarterly", 3), ("yearly", 12))
    if month_gaps:
        best_name, best_step, best_fit = max(
            (
                (name, step, Decimal(sum(gap == step for gap in month_gaps)) / Decimal(len(month_gaps)))
                for name, step in candidates
            ),
            key=lambda item: item[2],
        )
        if best_fit >= MIN_CADENCE_FIT:
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
            if fit >= MIN_CADENCE_FIT:
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
            tolerance = 2 if cadence == "weekly" else 3
            matches = abs((current_date - previous).days - step) <= tolerance
        current = current + 1 if matches else 1
        longest = max(longest, current)
    return longest


def _calendar_schedule_features(
    unique_dates: list[date], cadence: str, step: int, analysis_end: date
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
        next_expected = _scheduled_date(_month_index(last_occurrence) + step, target_day, month_end_pattern)
        actual_by_month: dict[int, list[date]] = defaultdict(list)
        for value in unique_dates:
            actual_by_month[_month_index(value)].append(value)
        missed = 0
        expected_index = _month_index(unique_dates[0]) + step
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
        grace_days = 5
    else:
        next_expected = last_occurrence + timedelta(days=step)
        missed = ((analysis_end - next_expected).days // step + 1) if next_expected + timedelta(days=3) <= analysis_end else 0
        grace_days = 3

    return (
        next_expected,
        missed,
        next_expected + timedelta(days=grace_days) <= analysis_end,
        day_of_month_stability,
        month_end_fit,
        day_of_week_stability,
    )


def build_recurring_profiles(
    transactions: list[TransactionSnapshot],
    analysis_end: date,
    identity_map: dict[str, MerchantIdentity],
) -> list[dict[str, object]]:
    """Return explainable recurring profiles for independently segmented streams."""

    profiles: list[dict[str, object]] = []
    for stream in build_recurring_streams(transactions, identity_map):
        ordered = sorted(stream.transactions, key=lambda item: (item.transaction_date, item.id))
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
            day_of_week_stability if cadence_name in {"weekly", "biweekly"} else day_of_month_stability
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
                "streamKey": stream.stream_key,
                "streamDescriptor": stream.descriptor or None,
                "merchant": observed_merchants[-1],
                "canonicalMerchant": stream.canonical_merchant,
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
        key=lambda item: (-Decimal(str(item["patternScore"])), str(item["streamKey"])),
    )[:16]
