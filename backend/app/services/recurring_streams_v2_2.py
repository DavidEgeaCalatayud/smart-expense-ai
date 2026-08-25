from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from app.services.intelligence_rules import TransactionSnapshot
from app.services.merchant_canonicalization import MerchantIdentity
from app.services.recurring_streams import (
    ONE,
    SCORE_HUNDRED,
    ZERO,
    RecurringStream,
    _calendar_cadence,
    _calendar_schedule_features,
    _longest_consecutive_periods,
    _median_decimal,
    _median_int,
    _money,
    _ratio,
    build_recurring_streams,
)
from app.services.temporal_stream_clustering import split_temporal_lanes


ANALYSIS_VERSION = "historical-v2.2"


@dataclass(frozen=True)
class RecurringStreamV22:
    stream_key: str
    canonical_merchant: str
    descriptor: str
    transactions: tuple[TransactionSnapshot, ...]
    basis: str
    calendar_signature: str


def _as_v22(stream: RecurringStream, *, basis: str, calendar_signature: str = "") -> RecurringStreamV22:
    return RecurringStreamV22(
        stream_key=stream.stream_key,
        canonical_merchant=stream.canonical_merchant,
        descriptor=stream.descriptor,
        transactions=stream.transactions,
        basis=basis,
        calendar_signature=calendar_signature,
    )


def build_recurring_streams_v2_2(
    transactions: list[TransactionSnapshot],
    identity_map: dict[str, MerchantIdentity],
) -> list[RecurringStreamV22]:
    """Add temporal lanes only where descriptor/amount evidence is still ambiguous.

    v2.1 remains untouched. v2.2 starts from its deterministic descriptor/amount streams
    and asks whether a descriptor-less stream contains multiple concurrent calendar phases.
    Stable monthly or weekly lanes are split; weak evidence is kept as one ambiguous stream.
    """

    result: list[RecurringStreamV22] = []
    for stream in build_recurring_streams(transactions, identity_map):
        if stream.descriptor:
            result.append(_as_v22(stream, basis="descriptor_amount"))
            continue

        temporal_lanes = split_temporal_lanes(list(stream.transactions))
        if temporal_lanes is None:
            basis = "amount" if "amount-" in stream.stream_key else "merchant_default"
            result.append(_as_v22(stream, basis=basis))
            continue

        base_suffix = stream.stream_key.split("::", 1)[1]
        for lane in temporal_lanes:
            suffix = lane.suffix if base_suffix == "default" else f"{base_suffix}-{lane.suffix}"
            result.append(
                RecurringStreamV22(
                    stream_key=f"{stream.canonical_merchant}::{suffix}",
                    canonical_merchant=stream.canonical_merchant,
                    descriptor="",
                    transactions=lane.transactions,
                    basis=lane.basis,
                    calendar_signature=lane.calendar_signature,
                )
            )

    return sorted(result, key=lambda item: (item.canonical_merchant, item.stream_key))


def build_recurring_profiles_v2_2(
    transactions: list[TransactionSnapshot],
    analysis_end: date,
    identity_map: dict[str, MerchantIdentity],
    *,
    limit: int | None = 20,
) -> list[dict[str, object]]:
    profiles: list[dict[str, object]] = []
    for stream in build_recurring_streams_v2_2(transactions, identity_map):
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
                "streamBasis": stream.basis,
                "streamCalendar": stream.calendar_signature or None,
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

    ordered_profiles = sorted(
        profiles,
        key=lambda item: (-Decimal(str(item["patternScore"])), str(item["streamKey"])),
    )
    return ordered_profiles if limit is None else ordered_profiles[:limit]
