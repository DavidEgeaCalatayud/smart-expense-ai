from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from app.services.intelligence_rules import TransactionSnapshot
from app.services.recurring_streams import (
    RecurringStream,
    _amount_matches,
    _calendar_cadence,
    _calendar_schedule_features,
    _median_amount,
    _median_int,
)


MIN_QUALIFIED_ROOT_TOKENS = 2
MIN_CONTINUITY_OCCURRENCES = 4
MIN_CONTINUITY_CADENCE_FIT = Decimal("0.80")
MIN_CONTINUITY_CALENDAR_STABILITY = Decimal("0.70")
MAX_CONTINUITY_PRICE_REGIMES = 3
MAX_CONTINUITY_PRICE_CHANGE_RATIO = Decimal("0.50")
MAX_CONTINUITY_PERIOD_GAP_MULTIPLIER = 2
MAX_MONTH_BOUNDARY_SHIFT_DAYS = 4
MAX_MONTH_START_TARGET_DAY = 4
MIN_REACTIVATION_OCCURRENCES = 2
MIN_PRIOR_EPISODE_OCCURRENCES = 4
REQUIRE_CONTINUITY_CURRENT_SCHEDULE = True
CONTINUITY_CADENCES = {"monthly", "quarterly", "yearly"}


@dataclass(frozen=True)
class ContinuityStream:
    stream: RecurringStream
    relinked: bool
    source_stream_count: int
    canonical_variant_count: int
    price_regime_count: int
    reactivated: bool = False


def _tokens(value: str) -> tuple[str, ...]:
    return tuple(token for token in value.casefold().split() if token)


def _qualified_prefix(candidate: str, value: str) -> bool:
    candidate_tokens = _tokens(candidate)
    value_tokens = _tokens(value)
    return (
        len(candidate_tokens) >= MIN_QUALIFIED_ROOT_TOKENS
        and len(candidate_tokens) <= len(value_tokens)
        and value_tokens[: len(candidate_tokens)] == candidate_tokens
    )


def _canonical_root(canonical: str, all_canonicals: set[str]) -> str:
    candidates = [
        value
        for value in all_canonicals
        if value == canonical or _qualified_prefix(value, canonical)
    ]
    return min(candidates, key=lambda value: (len(_tokens(value)), len(value), value))


def _regime_centres(streams: list[RecurringStream]) -> tuple[list[Decimal], dict[str, int]]:
    centres: list[Decimal] = []
    regime_by_stream: dict[str, int] = {}

    for stream in sorted(streams, key=lambda item: (_median_amount(list(item.transactions)), item.stream_key)):
        centre = _median_amount(list(stream.transactions))
        regime_index = next(
            (
                index
                for index, existing in enumerate(centres)
                if _amount_matches(centre, existing, descriptor_match=False)
            ),
            None,
        )
        if regime_index is None:
            centres.append(centre)
            regime_index = len(centres) - 1
        regime_by_stream[stream.stream_key] = regime_index

    return centres, regime_by_stream


def _regimes_are_sequential(
    streams: list[RecurringStream],
    centres: list[Decimal],
    regime_by_stream: dict[str, int],
) -> bool:
    if len(centres) > MAX_CONTINUITY_PRICE_REGIMES:
        return False

    ordered: list[tuple[date, str, int]] = []
    for stream in streams:
        regime = regime_by_stream[stream.stream_key]
        for transaction in stream.transactions:
            ordered.append((transaction.transaction_date, transaction.id, regime))
    ordered.sort()

    compressed: list[int] = []
    for _, _, regime in ordered:
        if not compressed or compressed[-1] != regime:
            compressed.append(regime)

    if len(compressed) != len(set(compressed)):
        return False

    for previous, current in zip(compressed, compressed[1:]):
        lower = min(centres[previous], centres[current])
        if lower <= 0:
            return False
        change_ratio = abs(centres[current] - centres[previous]) / lower
        if change_ratio > MAX_CONTINUITY_PRICE_CHANGE_RATIO:
            return False
    return True


def _period_key(value: date, cadence: str) -> str:
    if cadence == "monthly":
        return value.strftime("%Y-%m")
    if cadence == "quarterly":
        return f"{value.year}-Q{((value.month - 1) // 3) + 1}"
    if cadence == "yearly":
        return str(value.year)
    return value.isoformat()


def _month_index(value: date) -> int:
    return value.year * 12 + value.month - 1


def _next_month_target(value: date, target_day: int) -> date:
    if value.month == 12:
        year, month = value.year + 1, 1
    else:
        year, month = value.year, value.month + 1
    return date(year, month, min(target_day, monthrange(year, month)[1]))


def _month_start_target_day(unique_dates: list[date]) -> int | None:
    if len(unique_dates) < 2:
        return None
    target_day = int(
        _median_int([value.day for value in unique_dates]).quantize(
            Decimal("1"),
            rounding=ROUND_HALF_UP,
        )
    )
    return target_day if target_day <= MAX_MONTH_START_TARGET_DAY else None


def _normalize_month_boundary_date(value: date, target_day: int | None) -> date:
    if target_day is None or value.day < 27:
        return value
    nominal = _next_month_target(value, target_day)
    if 0 < (nominal - value).days <= MAX_MONTH_BOUNDARY_SHIFT_DAYS:
        return nominal
    return value


def normalize_month_boundary_shifts(unique_dates: list[date]) -> list[date]:
    """Map tightly bounded early-month weekend shifts to the nominal billing month."""

    if len(unique_dates) < 2:
        return unique_dates
    target_day = _month_start_target_day(unique_dates)
    return sorted(
        {
            _normalize_month_boundary_date(value, target_day)
            for value in unique_dates
        }
    )


def _has_acceptable_schedule_gaps(unique_dates: list[date], cadence: str, step: int) -> bool:
    if cadence not in CONTINUITY_CADENCES:
        return False
    maximum_gap = step * MAX_CONTINUITY_PERIOD_GAP_MULTIPLIER
    return all(
        _month_index(current) - _month_index(previous) <= maximum_gap
        for previous, current in zip(unique_dates, unique_dates[1:])
    )


def _schedule_info(
    streams: list[RecurringStream],
    *,
    minimum_occurrences: int,
) -> tuple[str, int, Decimal, list[date]] | None:
    unique_dates = sorted(
        {
            transaction.transaction_date
            for stream in streams
            for transaction in stream.transactions
        }
    )
    if len(unique_dates) < minimum_occurrences:
        return None
    schedule_dates = normalize_month_boundary_shifts(unique_dates)
    cadence_info = _calendar_cadence(schedule_dates)
    if cadence_info is None:
        return None
    cadence, step, cadence_fit = cadence_info
    if cadence not in CONTINUITY_CADENCES or cadence_fit < MIN_CONTINUITY_CADENCE_FIT:
        return None
    return cadence, step, cadence_fit, schedule_dates


def _single_schedule(
    streams: list[RecurringStream],
    *,
    analysis_end: date | None,
    minimum_occurrences: int = MIN_CONTINUITY_OCCURRENCES,
) -> bool:
    schedule_info = _schedule_info(streams, minimum_occurrences=minimum_occurrences)
    if schedule_info is None:
        return False
    cadence, step, _, schedule_dates = schedule_info
    if not _has_acceptable_schedule_gaps(schedule_dates, cadence, step):
        return False

    period_keys = [_period_key(value, cadence) for value in schedule_dates]
    if len(period_keys) != len(set(period_keys)):
        return False

    cutoff = analysis_end or schedule_dates[-1]
    (
        _,
        missed_expected,
        expected_payment_missing,
        day_of_month_stability,
        _,
        _,
    ) = _calendar_schedule_features(schedule_dates, cadence, step, cutoff)
    if REQUIRE_CONTINUITY_CURRENT_SCHEDULE and (
        expected_payment_missing or missed_expected > 0
    ):
        return False
    return day_of_month_stability >= MIN_CONTINUITY_CALENDAR_STABILITY


def _restrict_streams(
    streams: list[RecurringStream],
    transactions: list[TransactionSnapshot],
) -> list[RecurringStream]:
    ids = {item.id for item in transactions}
    restricted: list[RecurringStream] = []
    for stream in streams:
        selected = tuple(item for item in stream.transactions if item.id in ids)
        if not selected:
            continue
        restricted.append(
            RecurringStream(
                stream_key=stream.stream_key,
                canonical_merchant=stream.canonical_merchant,
                descriptor=stream.descriptor,
                transactions=selected,
            )
        )
    return restricted


def _split_lifecycle_episodes(
    streams: list[RecurringStream],
    *,
    cadence: str,
    step: int,
) -> list[list[TransactionSnapshot]]:
    transactions = sorted(
        (item for stream in streams for item in stream.transactions),
        key=lambda item: (item.transaction_date, item.id),
    )
    if not transactions:
        return []

    raw_dates = sorted({item.transaction_date for item in transactions})
    target_day = _month_start_target_day(raw_dates)
    maximum_gap = step * MAX_CONTINUITY_PERIOD_GAP_MULTIPLIER

    episodes: list[list[TransactionSnapshot]] = [[]]
    previous_nominal: date | None = None
    for transaction in transactions:
        nominal = _normalize_month_boundary_date(transaction.transaction_date, target_day)
        if (
            previous_nominal is not None
            and _month_index(nominal) - _month_index(previous_nominal) > maximum_gap
        ):
            episodes.append([])
        episodes[-1].append(transaction)
        previous_nominal = nominal
    return episodes


def _price_change_is_bounded(previous: list[RecurringStream], current: list[RecurringStream]) -> bool:
    previous_amount = _median_amount(
        [item for stream in previous for item in stream.transactions]
    )
    current_amount = _median_amount(
        [item for stream in current for item in stream.transactions]
    )
    lower = min(previous_amount, current_amount)
    if lower <= 0:
        return False
    return abs(current_amount - previous_amount) / lower <= MAX_CONTINUITY_PRICE_CHANGE_RATIO


def _reactivated_episode(
    candidates: list[RecurringStream],
    *,
    analysis_end: date | None,
) -> tuple[list[RecurringStream], int] | None:
    full_info = _schedule_info(
        candidates,
        minimum_occurrences=MIN_CONTINUITY_OCCURRENCES,
    )
    if full_info is None:
        return None
    cadence, step, _, _ = full_info

    episodes = _split_lifecycle_episodes(candidates, cadence=cadence, step=step)
    if len(episodes) < 2:
        return None

    previous_transactions = episodes[-2]
    current_transactions = episodes[-1]
    if len({item.transaction_date for item in previous_transactions}) < MIN_PRIOR_EPISODE_OCCURRENCES:
        return None
    if len({item.transaction_date for item in current_transactions}) < MIN_REACTIVATION_OCCURRENCES:
        return None

    previous_streams = _restrict_streams(candidates, previous_transactions)
    current_streams = _restrict_streams(candidates, current_transactions)
    previous_info = _schedule_info(
        previous_streams,
        minimum_occurrences=MIN_PRIOR_EPISODE_OCCURRENCES,
    )
    current_info = _schedule_info(
        current_streams,
        minimum_occurrences=MIN_REACTIVATION_OCCURRENCES,
    )
    if previous_info is None or current_info is None:
        return None
    if previous_info[:2] != current_info[:2]:
        return None

    previous_end = max(item.transaction_date for item in previous_transactions)
    if not _single_schedule(
        previous_streams,
        analysis_end=previous_end,
        minimum_occurrences=MIN_PRIOR_EPISODE_OCCURRENCES,
    ):
        return None
    if not _single_schedule(
        current_streams,
        analysis_end=analysis_end,
        minimum_occurrences=MIN_REACTIVATION_OCCURRENCES,
    ):
        return None
    if not _price_change_is_bounded(previous_streams, current_streams):
        return None

    centres, regime_by_stream = _regime_centres(current_streams)
    if not _regimes_are_sequential(current_streams, centres, regime_by_stream):
        return None
    return current_streams, len(episodes)


def relink_price_continuity_streams(
    streams: list[RecurringStream],
    *,
    analysis_end: date | None = None,
) -> list[ContinuityStream]:
    """Re-link active price fragments and conservative lifecycle reactivations.

    A long gap still terminates the original schedule. It is never bridged as uninterrupted
    price continuity. A new lifecycle episode may regain the same merchant identity only
    after two consecutive, cadence-compatible current charges match an established prior
    episode. This preserves cancellation/dormancy while allowing evidence-backed recovery.
    """

    if not streams:
        return []

    all_canonicals = {stream.canonical_merchant for stream in streams}
    grouped: dict[tuple[str, str], list[RecurringStream]] = {}
    for stream in streams:
        root = _canonical_root(stream.canonical_merchant, all_canonicals)
        grouped.setdefault((root, stream.descriptor.casefold()), []).append(stream)

    result: list[ContinuityStream] = []
    for (root, descriptor), candidates in sorted(grouped.items()):
        candidates = sorted(candidates, key=lambda item: item.stream_key)
        if len(candidates) == 1:
            stream = candidates[0]
            result.append(
                ContinuityStream(
                    stream=stream,
                    relinked=False,
                    source_stream_count=1,
                    canonical_variant_count=1,
                    price_regime_count=1,
                )
            )
            continue

        centres, regime_by_stream = _regime_centres(candidates)
        canonical_variants = {item.canonical_merchant for item in candidates}
        if _single_schedule(candidates, analysis_end=analysis_end) and _regimes_are_sequential(
            candidates,
            centres,
            regime_by_stream,
        ):
            transactions = tuple(
                sorted(
                    (transaction for stream in candidates for transaction in stream.transactions),
                    key=lambda item: (item.transaction_date, item.id),
                )
            )
            suffix = f"{descriptor.replace(' ', '-')}-price-continuity" if descriptor else "price-continuity"
            result.append(
                ContinuityStream(
                    stream=RecurringStream(
                        stream_key=f"{root}::{suffix}",
                        canonical_merchant=root,
                        descriptor=descriptor,
                        transactions=transactions,
                    ),
                    relinked=True,
                    source_stream_count=len(candidates),
                    canonical_variant_count=len(canonical_variants),
                    price_regime_count=len(centres),
                )
            )
            continue

        reactivation = _reactivated_episode(candidates, analysis_end=analysis_end)
        if reactivation is not None:
            current_streams, _ = reactivation
            current_centres, _ = _regime_centres(current_streams)
            current_variants = {item.canonical_merchant for item in current_streams}
            transactions = tuple(
                sorted(
                    (transaction for stream in current_streams for transaction in stream.transactions),
                    key=lambda item: (item.transaction_date, item.id),
                )
            )
            suffix = (
                f"{descriptor.replace(' ', '-')}-lifecycle-reactivation"
                if descriptor
                else "lifecycle-reactivation"
            )
            result.append(
                ContinuityStream(
                    stream=RecurringStream(
                        stream_key=f"{root}::{suffix}",
                        canonical_merchant=root,
                        descriptor=descriptor,
                        transactions=transactions,
                    ),
                    relinked=True,
                    source_stream_count=len(current_streams),
                    canonical_variant_count=len(current_variants),
                    price_regime_count=len(current_centres),
                    reactivated=True,
                )
            )
            continue

        for stream in candidates:
            result.append(
                ContinuityStream(
                    stream=stream,
                    relinked=False,
                    source_stream_count=1,
                    canonical_variant_count=1,
                    price_regime_count=1,
                )
            )

    return sorted(
        result,
        key=lambda item: (item.stream.canonical_merchant, item.stream.stream_key),
    )
