from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from app.services.intelligence_rules import TransactionSnapshot
from app.services.recurring_price_continuity import (
    CONTINUITY_CADENCES,
    MAX_CONTINUITY_PERIOD_GAP_MULTIPLIER,
    MAX_CONTINUITY_PRICE_CHANGE_RATIO,
    MIN_CONTINUITY_CADENCE_FIT,
    _canonical_root,
    _month_index,
    _month_start_target_day,
    _normalize_month_boundary_date,
)
from app.services.recurring_streams import RecurringStream, _median_decimal, _median_int


MIN_PRIOR_EPISODE_OCCURRENCES = 4
MIN_REACTIVATION_OCCURRENCES = 1
MAX_REACTIVATION_CALENDAR_DEVIATION_DAYS = 4
SCHEDULE_GRACE_DAYS = 5


@dataclass(frozen=True)
class LifecycleReactivation:
    stream: RecurringStream
    source_stream_keys: tuple[str, ...]
    source_stream_count: int
    canonical_variant_count: int
    price_regime_count: int
    cadence: str
    cadence_step: int
    cadence_fit: Decimal
    lifecycle_episode_count: int
    prior_episode_occurrence_count: int
    prior_transactions: tuple[TransactionSnapshot, ...]
    prior_schedule_dates: tuple[date, ...]
    current_schedule_dates: tuple[date, ...]


def _month_from_index(value: int) -> tuple[int, int]:
    year, month_index = divmod(value, 12)
    return year, month_index + 1


def _last_day(year: int, month: int) -> int:
    if month == 12:
        return (date(year + 1, 1, 1) - timedelta(days=1)).day
    return (date(year, month + 1, 1) - timedelta(days=1)).day


def _is_month_end(value: date) -> bool:
    return value.day == _last_day(value.year, value.month)


def _scheduled_date(month_index: int, target_day: int, month_end_pattern: bool) -> date:
    year, month = _month_from_index(month_index)
    day = _last_day(year, month) if month_end_pattern else min(target_day, _last_day(year, month))
    return date(year, month, day)


def _all_transactions(streams: list[RecurringStream]) -> list[TransactionSnapshot]:
    return sorted(
        (item for stream in streams for item in stream.transactions),
        key=lambda item: (item.transaction_date, item.id),
    )


def _nominal_schedule_dates(
    transactions: list[TransactionSnapshot],
    *,
    boundary_target_day: int | None,
) -> list[date]:
    return sorted(
        {
            _normalize_month_boundary_date(item.transaction_date, boundary_target_day)
            for item in transactions
        }
    )


def _lifecycle_cadence(
    schedule_dates: list[date],
) -> tuple[str, int, Decimal] | None:
    """Infer cadence while treating long gaps as lifecycle boundaries, not cadence failures."""

    if len(schedule_dates) < MIN_PRIOR_EPISODE_OCCURRENCES + MIN_REACTIVATION_OCCURRENCES:
        return None
    month_gaps = [
        _month_index(current) - _month_index(previous)
        for previous, current in zip(schedule_dates, schedule_dates[1:])
    ]
    candidates: list[tuple[int, Decimal, str, int]] = []
    for cadence, step in (("monthly", 1), ("quarterly", 3), ("yearly", 12)):
        local_gaps = [
            gap
            for gap in month_gaps
            if 0 < gap <= step * MAX_CONTINUITY_PERIOD_GAP_MULTIPLIER
        ]
        if not local_gaps:
            continue
        matching = sum(gap == step for gap in local_gaps)
        fit = Decimal(matching) / Decimal(len(local_gaps))
        if matching >= MIN_PRIOR_EPISODE_OCCURRENCES - 1 and fit >= MIN_CONTINUITY_CADENCE_FIT:
            candidates.append((matching, fit, cadence, step))
    if not candidates:
        return None
    _, fit, cadence, step = max(candidates, key=lambda item: (item[0], item[1], -item[3]))
    return cadence, step, fit


def _split_episodes(
    transactions: list[TransactionSnapshot],
    *,
    step: int,
    boundary_target_day: int | None,
) -> list[list[TransactionSnapshot]]:
    maximum_gap = step * MAX_CONTINUITY_PERIOD_GAP_MULTIPLIER
    episodes: list[list[TransactionSnapshot]] = [[]]
    previous_nominal: date | None = None
    for transaction in transactions:
        nominal = _normalize_month_boundary_date(transaction.transaction_date, boundary_target_day)
        if (
            previous_nominal is not None
            and _month_index(nominal) - _month_index(previous_nominal) > maximum_gap
        ):
            episodes.append([])
        episodes[-1].append(transaction)
        previous_nominal = nominal
    return [episode for episode in episodes if episode]


def _cadence_fit(schedule_dates: list[date], step: int) -> Decimal:
    if len(schedule_dates) < 2:
        return Decimal("1")
    gaps = [
        _month_index(current) - _month_index(previous)
        for previous, current in zip(schedule_dates, schedule_dates[1:])
    ]
    return Decimal(sum(gap == step for gap in gaps)) / Decimal(len(gaps))


def _calendar_signature(schedule_dates: list[date]) -> tuple[int, bool, Decimal]:
    days = [item.day for item in schedule_dates]
    target_day = int(
        _median_int(days).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    )
    month_end_fit = Decimal(sum(_is_month_end(item) for item in schedule_dates)) / Decimal(len(schedule_dates))
    return target_day, month_end_fit >= Decimal("0.60"), month_end_fit


def _calendar_matches_prior(
    prior_dates: list[date],
    current_dates: list[date],
    *,
    step: int,
) -> bool:
    if not current_dates:
        return False
    target_day, month_end_pattern, _ = _calendar_signature(prior_dates)
    for current in current_dates:
        if month_end_pattern:
            if not _is_month_end(current):
                return False
        elif abs(current.day - target_day) > MAX_REACTIVATION_CALENDAR_DEVIATION_DAYS:
            return False
    return all(
        _month_index(current) - _month_index(previous) == step
        for previous, current in zip(current_dates, current_dates[1:])
    )


def _current_episode_is_active(
    current_dates: list[date],
    prior_dates: list[date],
    *,
    step: int,
    analysis_end: date,
) -> bool:
    target_day, month_end_pattern, _ = _calendar_signature(prior_dates)
    last_current = current_dates[-1]
    next_expected = _scheduled_date(
        _month_index(last_current) + step,
        target_day,
        month_end_pattern,
    )
    return next_expected + timedelta(days=SCHEDULE_GRACE_DAYS) > analysis_end


def _amount_change_is_bounded(
    previous: list[TransactionSnapshot],
    current: list[TransactionSnapshot],
) -> bool:
    previous_amount = _median_decimal([item.amount for item in previous])
    current_amount = _median_decimal([item.amount for item in current])
    lower = min(previous_amount, current_amount)
    if lower <= 0:
        return False
    return abs(current_amount - previous_amount) / lower <= MAX_CONTINUITY_PRICE_CHANGE_RATIO


def _price_regime_count(transactions: list[TransactionSnapshot]) -> int:
    if not transactions:
        return 0
    centres: list[Decimal] = []
    for amount in sorted(item.amount for item in transactions):
        matched = next(
            (
                centre
                for centre in centres
                if abs(amount - centre) <= max(Decimal("1.00"), centre * Decimal("0.12"))
            ),
            None,
        )
        if matched is None:
            centres.append(amount)
    return len(centres)


def _qualified_group_key(
    stream: RecurringStream,
    all_canonicals: set[str],
) -> tuple[str, str]:
    root = _canonical_root(stream.canonical_merchant, all_canonicals)
    return root, stream.descriptor.casefold()


def detect_lifecycle_reactivations(
    streams: list[RecurringStream],
    *,
    analysis_end: date,
) -> list[LifecycleReactivation]:
    """Return active post-dormancy episodes without bridging the dormant interval.

    A prior episode must contain at least four cadence-consistent observations. A new episode
    can reactivate immediately on its first charge only when merchant-family identity, amount,
    calendar position and inherited cadence all agree with that established history. A charge
    posted early into the preceding month becomes eligible only when its nominal billing date
    has arrived. The current episode is emitted on its own, so dormant periods never become
    missed occurrences.
    """

    if not streams:
        return []
    all_canonicals = {stream.canonical_merchant for stream in streams}
    grouped: dict[tuple[str, str], list[RecurringStream]] = {}
    for stream in streams:
        grouped.setdefault(_qualified_group_key(stream, all_canonicals), []).append(stream)

    result: list[LifecycleReactivation] = []
    for (root, descriptor), candidates in sorted(grouped.items()):
        candidates = sorted(candidates, key=lambda item: item.stream_key)
        transactions = _all_transactions(candidates)
        raw_dates = sorted({item.transaction_date for item in transactions})
        if len(raw_dates) < MIN_PRIOR_EPISODE_OCCURRENCES + MIN_REACTIVATION_OCCURRENCES:
            continue

        boundary_target_day = _month_start_target_day(raw_dates)
        schedule_dates = _nominal_schedule_dates(
            transactions,
            boundary_target_day=boundary_target_day,
        )
        cadence_info = _lifecycle_cadence(schedule_dates)
        if cadence_info is None:
            continue
        cadence, step, overall_fit = cadence_info
        if cadence not in CONTINUITY_CADENCES:
            continue

        episodes = _split_episodes(
            transactions,
            step=step,
            boundary_target_day=boundary_target_day,
        )
        if len(episodes) < 2:
            continue
        previous = episodes[-2]
        current = episodes[-1]
        if len({item.transaction_date for item in previous}) < MIN_PRIOR_EPISODE_OCCURRENCES:
            continue
        if len({item.transaction_date for item in current}) < MIN_REACTIVATION_OCCURRENCES:
            continue

        prior_dates = _nominal_schedule_dates(
            previous,
            boundary_target_day=boundary_target_day,
        )
        current_dates = _nominal_schedule_dates(
            current,
            boundary_target_day=boundary_target_day,
        )
        if not current_dates or current_dates[-1] > analysis_end:
            continue

        prior_fit = _cadence_fit(prior_dates, step)
        if prior_fit < MIN_CONTINUITY_CADENCE_FIT:
            continue
        if not all(
            _month_index(current_date) - _month_index(previous_date) == step
            for previous_date, current_date in zip(prior_dates, prior_dates[1:])
        ):
            continue
        if not _calendar_matches_prior(prior_dates, current_dates, step=step):
            continue
        if not _current_episode_is_active(
            current_dates,
            prior_dates,
            step=step,
            analysis_end=analysis_end,
        ):
            continue
        if not _amount_change_is_bounded(previous, current):
            continue

        observed_variants = {item.canonical_merchant for item in candidates}
        suffix = (
            f"{descriptor.replace(' ', '-')}-lifecycle-reactivation"
            if descriptor
            else "lifecycle-reactivation"
        )
        result.append(
            LifecycleReactivation(
                stream=RecurringStream(
                    stream_key=f"{root}::{suffix}",
                    canonical_merchant=root,
                    descriptor=descriptor,
                    transactions=tuple(current),
                ),
                source_stream_keys=tuple(item.stream_key for item in candidates),
                source_stream_count=len(candidates),
                canonical_variant_count=len(observed_variants),
                price_regime_count=_price_regime_count(current),
                cadence=cadence,
                cadence_step=step,
                cadence_fit=min(Decimal("1"), max(prior_fit, overall_fit)),
                lifecycle_episode_count=len(episodes),
                prior_episode_occurrence_count=len(prior_dates),
                prior_transactions=tuple(previous),
                prior_schedule_dates=tuple(prior_dates),
                current_schedule_dates=tuple(current_dates),
            )
        )

    return result


__all__ = [
    "LifecycleReactivation",
    "MAX_REACTIVATION_CALENDAR_DEVIATION_DAYS",
    "MIN_PRIOR_EPISODE_OCCURRENCES",
    "MIN_REACTIVATION_OCCURRENCES",
    "detect_lifecycle_reactivations",
]
