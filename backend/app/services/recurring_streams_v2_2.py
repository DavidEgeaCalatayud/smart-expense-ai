from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from app.services.intelligence_rules import TransactionSnapshot
from app.services.merchant_canonicalization import MerchantIdentity
from app.services.recurring_lifecycle import detect_lifecycle_reactivations
from app.services.recurring_price_continuity import relink_price_continuity_streams
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
MIN_AMOUNT_ONLY_CONSECUTIVE_PERIODS = 5
MIN_AMOUNT_ONLY_CALENDAR_STABILITY = Decimal("0.75")
MIN_AMOUNT_ONLY_EARLY_CONSECUTIVE_PERIODS = 4
MIN_AMOUNT_ONLY_EARLY_CALENDAR_STABILITY = Decimal("0.95")


@dataclass(frozen=True)
class RecurringStreamV22:
    stream_key: str
    canonical_merchant: str
    descriptor: str
    transactions: tuple[TransactionSnapshot, ...]
    basis: str
    calendar_signature: str
    source_stream_count: int = 1
    canonical_variant_count: int = 1
    price_regime_count: int = 1
    lifecycle_reactivated: bool = False
    lifecycle_episode_count: int = 1
    prior_episode_occurrence_count: int = 0
    prior_transactions: tuple[TransactionSnapshot, ...] = ()
    prior_schedule_dates: tuple[date, ...] = ()
    schedule_dates: tuple[date, ...] = ()
    inherited_cadence: str = ""
    inherited_cadence_step: int = 0
    inherited_cadence_fit: Decimal = ZERO


def _as_v22(
    stream: RecurringStream,
    *,
    basis: str,
    calendar_signature: str = "",
    source_stream_count: int = 1,
    canonical_variant_count: int = 1,
    price_regime_count: int = 1,
) -> RecurringStreamV22:
    return RecurringStreamV22(
        stream_key=stream.stream_key,
        canonical_merchant=stream.canonical_merchant,
        descriptor=stream.descriptor,
        transactions=stream.transactions,
        basis=basis,
        calendar_signature=calendar_signature,
        source_stream_count=source_stream_count,
        canonical_variant_count=canonical_variant_count,
        price_regime_count=price_regime_count,
    )


def _cadence_period_key(value: date, cadence: str) -> str:
    if cadence == "monthly":
        return value.strftime("%Y-%m")
    if cadence == "quarterly":
        return f"{value.year}-Q{((value.month - 1) // 3) + 1}"
    if cadence == "yearly":
        return str(value.year)
    iso_year, iso_week, _ = value.isocalendar()
    if cadence == "weekly":
        return f"{iso_year}-W{iso_week:02d}"
    if cadence == "biweekly":
        return f"{iso_year}-BW{(iso_week - 1) // 2:02d}"
    return value.isoformat()


def build_recurring_streams_v2_2(
    transactions: list[TransactionSnapshot],
    identity_map: dict[str, MerchantIdentity],
    *,
    analysis_end: date | None = None,
) -> list[RecurringStreamV22]:
    """Build v2.2 streams with lifecycle, price-continuity and temporal relinking.

    Long gaps terminate a lifecycle episode. When an established prior episode and a new
    current charge agree on merchant family, amount, calendar position and inherited cadence,
    the new episode is emitted independently as ``merchant_lifecycle_reactivation``. This
    happens before price-continuity relinking so the dormant interval is never bridged or
    converted into missed payments. Remaining streams follow the existing conservative
    price-continuity and temporal-lane pipeline.
    """

    result: list[RecurringStreamV22] = []
    base_streams = build_recurring_streams(transactions, identity_map)

    consumed_stream_keys: set[str] = set()
    if analysis_end is not None:
        for lifecycle in detect_lifecycle_reactivations(
            base_streams,
            analysis_end=analysis_end,
        ):
            consumed_stream_keys.update(lifecycle.source_stream_keys)
            result.append(
                RecurringStreamV22(
                    stream_key=lifecycle.stream.stream_key,
                    canonical_merchant=lifecycle.stream.canonical_merchant,
                    descriptor=lifecycle.stream.descriptor,
                    transactions=lifecycle.stream.transactions,
                    basis="merchant_lifecycle_reactivation",
                    calendar_signature="",
                    source_stream_count=lifecycle.source_stream_count,
                    canonical_variant_count=lifecycle.canonical_variant_count,
                    price_regime_count=lifecycle.price_regime_count,
                    lifecycle_reactivated=True,
                    lifecycle_episode_count=lifecycle.lifecycle_episode_count,
                    prior_episode_occurrence_count=lifecycle.prior_episode_occurrence_count,
                    prior_transactions=lifecycle.prior_transactions,
                    prior_schedule_dates=lifecycle.prior_schedule_dates,
                    schedule_dates=lifecycle.current_schedule_dates,
                    inherited_cadence=lifecycle.cadence,
                    inherited_cadence_step=lifecycle.cadence_step,
                    inherited_cadence_fit=lifecycle.cadence_fit,
                )
            )

    continuity_input = [
        stream for stream in base_streams if stream.stream_key not in consumed_stream_keys
    ]
    for continuity in relink_price_continuity_streams(
        continuity_input,
        analysis_end=analysis_end,
    ):
        stream = continuity.stream
        if continuity.relinked:
            result.append(
                _as_v22(
                    stream,
                    basis=(
                        "merchant_lifecycle_reactivation"
                        if continuity.reactivated
                        else "merchant_price_continuity"
                    ),
                    source_stream_count=continuity.source_stream_count,
                    canonical_variant_count=continuity.canonical_variant_count,
                    price_regime_count=continuity.price_regime_count,
                )
            )
            continue

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


def _interval_features(values: list[date]) -> tuple[Decimal, Decimal]:
    intervals = [(current - previous).days for previous, current in zip(values, values[1:])]
    if not intervals:
        return Decimal("0"), ONE
    typical_interval = _median_int(intervals)
    interval_mad = _median_decimal(
        [abs(Decimal(interval) - typical_interval) for interval in intervals]
    )
    regularity = max(
        ZERO,
        ONE - min(ONE, interval_mad / max(typical_interval, ONE)),
    )
    return typical_interval, regularity


def build_recurring_profiles_v2_2(
    transactions: list[TransactionSnapshot],
    analysis_end: date,
    identity_map: dict[str, MerchantIdentity],
    *,
    limit: int | None = 20,
) -> list[dict[str, object]]:
    profiles: list[dict[str, object]] = []
    for stream in build_recurring_streams_v2_2(
        transactions,
        identity_map,
        analysis_end=analysis_end,
    ):
        ordered = sorted(stream.transactions, key=lambda item: (item.transaction_date, item.id))
        unique_dates = sorted({item.transaction_date for item in ordered})
        minimum_occurrences = 1 if stream.lifecycle_reactivated else 3
        if len(unique_dates) < minimum_occurrences:
            continue

        schedule_dates = (
            list(stream.schedule_dates)
            if stream.lifecycle_reactivated and stream.schedule_dates
            else unique_dates
        )
        if stream.lifecycle_reactivated:
            if not stream.inherited_cadence or stream.inherited_cadence_step <= 0:
                continue
            cadence_name = stream.inherited_cadence
            cadence_step = stream.inherited_cadence_step
            cadence_fit = stream.inherited_cadence_fit
            interval_evidence_dates = list(stream.prior_schedule_dates) or schedule_dates
        else:
            cadence_info = _calendar_cadence(schedule_dates)
            if cadence_info is None:
                continue
            cadence_name, cadence_step, cadence_fit = cadence_info
            interval_evidence_dates = schedule_dates

        typical_interval, interval_regularity = _interval_features(interval_evidence_dates)

        current_amounts = [item.amount for item in ordered]
        typical_amount = _median_decimal(current_amounts)
        if typical_amount <= ZERO:
            continue
        amount_evidence = (
            [item.amount for item in stream.prior_transactions] + current_amounts
            if stream.lifecycle_reactivated
            else current_amounts
        )
        amount_mad = _median_decimal(
            [abs(amount - typical_amount) for amount in amount_evidence]
        )
        amount_stability = max(ZERO, ONE - min(ONE, amount_mad / typical_amount))
        amount_mean = sum(amount_evidence, ZERO) / Decimal(len(amount_evidence))
        variance = sum(
            ((amount - amount_mean) ** 2 for amount in amount_evidence),
            ZERO,
        ) / Decimal(len(amount_evidence))
        amount_cv = variance.sqrt() / amount_mean if amount_mean > ZERO else ONE
        cv_stability = max(ZERO, ONE - min(ONE, amount_cv))

        (
            next_expected,
            missed_expected,
            expected_payment_missing,
            current_day_of_month_stability,
            current_month_end_fit,
            current_day_of_week_stability,
        ) = _calendar_schedule_features(
            schedule_dates,
            cadence_name,
            cadence_step,
            analysis_end,
        )

        if stream.lifecycle_reactivated and stream.prior_schedule_dates:
            prior_dates = list(stream.prior_schedule_dates)
            (
                _,
                _,
                _,
                day_of_month_stability,
                month_end_fit,
                day_of_week_stability,
            ) = _calendar_schedule_features(
                prior_dates,
                cadence_name,
                cadence_step,
                prior_dates[-1],
            )
        else:
            day_of_month_stability = current_day_of_month_stability
            month_end_fit = current_month_end_fit
            day_of_week_stability = current_day_of_week_stability

        calendar_position_stability = (
            day_of_week_stability
            if cadence_name in {"weekly", "biweekly"}
            else day_of_month_stability
        )
        evidence_occurrences = (
            stream.prior_episode_occurrence_count + len(schedule_dates)
            if stream.lifecycle_reactivated
            else len(schedule_dates)
        )
        history_depth = min(ONE, Decimal(max(evidence_occurrences - 2, 0)) / Decimal("4"))
        if stream.lifecycle_reactivated:
            consecutive_periods = len(schedule_dates)
        else:
            consecutive_periods = _longest_consecutive_periods(
                schedule_dates,
                cadence_name,
                cadence_step,
            )
        consecutive_fit = min(ONE, Decimal(max(consecutive_periods - 1, 0)) / Decimal("5"))
        period_counts = Counter(
            _cadence_period_key(value, cadence_name) for value in schedule_dates
        )
        same_period_extra_occurrences = sum(
            max(0, count - 1) for count in period_counts.values()
        )
        latest_period_key = _cadence_period_key(schedule_dates[-1], cadence_name)
        latest_period_extra_occurrences = max(0, period_counts[latest_period_key] - 1)
        missing_schedule_is_unambiguous = latest_period_extra_occurrences == 0

        if stream.basis == "amount":
            standard_evidence = (
                consecutive_periods >= MIN_AMOUNT_ONLY_CONSECUTIVE_PERIODS
                and calendar_position_stability >= MIN_AMOUNT_ONLY_CALENDAR_STABILITY
            )
            precise_early_evidence = (
                consecutive_periods >= MIN_AMOUNT_ONLY_EARLY_CONSECUTIVE_PERIODS
                and calendar_position_stability >= MIN_AMOUNT_ONLY_EARLY_CALENDAR_STABILITY
            )
            if not (standard_evidence or precise_early_evidence):
                continue

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
                "sourceStreamCount": stream.source_stream_count,
                "canonicalVariantCount": stream.canonical_variant_count,
                "priceRegimeCount": stream.price_regime_count,
                "lifecycleReactivated": stream.lifecycle_reactivated,
                "lifecycleEpisodeCount": stream.lifecycle_episode_count,
                "priorEpisodeOccurrenceCount": stream.prior_episode_occurrence_count,
                "merchant": observed_merchants[-1],
                "canonicalMerchant": stream.canonical_merchant,
                "observedMerchants": observed_merchants,
                "cadence": cadence_name,
                "occurrenceCount": len(schedule_dates),
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
                "samePeriodExtraOccurrences": same_period_extra_occurrences,
                "latestPeriodExtraOccurrences": latest_period_extra_occurrences,
                "missedExpectedOccurrences": (
                    missed_expected if missing_schedule_is_unambiguous else 0
                ),
                "isExpectedPaymentMissing": (
                    expected_payment_missing and missing_schedule_is_unambiguous
                ),
                "patternScore": _ratio(pattern_score, "0.1"),
                "nextExpectedDate": next_expected.isoformat(),
            }
        )

    ordered_profiles = sorted(
        profiles,
        key=lambda item: (-Decimal(str(item["patternScore"])), str(item["streamKey"])),
    )
    return ordered_profiles if limit is None else ordered_profiles[:limit]
