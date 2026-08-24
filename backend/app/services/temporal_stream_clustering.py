from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import date
from statistics import median

from app.services.intelligence_rules import TransactionSnapshot


MONTH_DAY_TOLERANCE = 4
MIN_MONTH_PHASE_SEPARATION = 7
MIN_MONTHLY_OCCURRENCES = 3
MIN_WEEKLY_OCCURRENCES = 4
MIN_CONCURRENT_PERIODS = 2


@dataclass(frozen=True)
class TemporalLane:
    suffix: str
    basis: str
    calendar_signature: str
    transactions: tuple[TransactionSnapshot, ...]


def _month_index(value: date) -> int:
    return value.year * 12 + value.month - 1


def _is_month_end(value: date) -> bool:
    return value.day == monthrange(value.year, value.month)[1]


def _month_phase(value: date) -> int:
    # Month-end is represented as a stable synthetic phase so 28/29/30/31 remain one lane.
    return 32 if _is_month_end(value) else value.day


def _median_int(values: list[int]) -> int:
    return int(round(float(median(values))))


def _best_calendar_step(dates: list[date]) -> tuple[int, float]:
    if len(dates) < 2:
        return 0, 0.0
    month_gaps = [
        _month_index(current) - _month_index(previous)
        for previous, current in zip(dates, dates[1:])
    ]
    candidates = (1, 3, 12)
    best_step = max(candidates, key=lambda step: sum(gap == step for gap in month_gaps))
    fit = sum(gap == best_step for gap in month_gaps) / len(month_gaps)
    return best_step, fit


def _monthly_phase_groups(transactions: list[TransactionSnapshot]) -> list[tuple[int, list[TransactionSnapshot]]]:
    clusters: list[list[TransactionSnapshot]] = []
    for transaction in sorted(transactions, key=lambda item: (_month_phase(item.transaction_date), item.transaction_date, item.id)):
        phase = _month_phase(transaction.transaction_date)
        best_index: int | None = None
        best_distance: int | None = None
        for index, cluster in enumerate(clusters):
            centre = _median_int([_month_phase(item.transaction_date) for item in cluster])
            distance = abs(phase - centre)
            if phase == 32 or centre == 32:
                if phase != centre:
                    continue
                distance = 0
            if distance <= MONTH_DAY_TOLERANCE and (best_distance is None or distance < best_distance):
                best_index = index
                best_distance = distance
        if best_index is None:
            clusters.append([transaction])
        else:
            clusters[best_index].append(transaction)

    valid: list[tuple[int, list[TransactionSnapshot]]] = []
    for cluster in clusters:
        dates = sorted({item.transaction_date for item in cluster})
        distinct_months = {_month_index(value) for value in dates}
        if len(dates) < MIN_MONTHLY_OCCURRENCES or len(distinct_months) < MIN_MONTHLY_OCCURRENCES:
            continue
        step, fit = _best_calendar_step(dates)
        if step not in {1, 3, 12} or fit < 0.75:
            continue
        phase = _median_int([_month_phase(value) for value in dates])
        valid.append((phase, cluster))
    return valid


def _monthly_groups_are_concurrent(groups: list[tuple[int, list[TransactionSnapshot]]]) -> bool:
    if len(groups) < 2:
        return False

    phases = sorted(phase for phase, _ in groups)
    for first, second in zip(phases, phases[1:]):
        if first != 32 and second != 32 and second - first < MIN_MONTH_PHASE_SEPARATION:
            return False

    # Strong evidence that these are simultaneous schedules rather than one schedule whose
    # billing day drifted over time: at least two calendar months contain both lanes.
    month_sets = [
        {_month_index(item.transaction_date) for item in transactions}
        for _, transactions in groups
    ]
    for left_index in range(len(month_sets)):
        for right_index in range(left_index + 1, len(month_sets)):
            if len(month_sets[left_index] & month_sets[right_index]) < MIN_CONCURRENT_PERIODS:
                return False
    return True


def _weekly_groups(transactions: list[TransactionSnapshot]) -> list[tuple[int, list[TransactionSnapshot]]]:
    by_weekday: dict[int, list[TransactionSnapshot]] = {}
    for transaction in transactions:
        by_weekday.setdefault(transaction.transaction_date.weekday(), []).append(transaction)

    valid: list[tuple[int, list[TransactionSnapshot]]] = []
    for weekday, group in sorted(by_weekday.items()):
        dates = sorted({item.transaction_date for item in group})
        if len(dates) < MIN_WEEKLY_OCCURRENCES:
            continue
        intervals = [(current - previous).days for previous, current in zip(dates, dates[1:])]
        if not intervals:
            continue
        weekly_like = sum(interval % 7 == 0 and interval <= 21 for interval in intervals) / len(intervals)
        if weekly_like < 0.75 or float(median(intervals)) > 14:
            continue
        valid.append((weekday, group))
    return valid


def _weekly_groups_are_concurrent(groups: list[tuple[int, list[TransactionSnapshot]]]) -> bool:
    if len(groups) < 2:
        return False
    week_sets = []
    for _, group in groups:
        week_sets.append({item.transaction_date.isocalendar()[:2] for item in group})
    for left_index in range(len(week_sets)):
        for right_index in range(left_index + 1, len(week_sets)):
            if len(week_sets[left_index] & week_sets[right_index]) < 3:
                return False
    return True


def split_temporal_lanes(transactions: list[TransactionSnapshot]) -> list[TemporalLane] | None:
    """Split an otherwise indistinguishable amount stream using concurrent calendar phases.

    This is deliberately conservative. A split is accepted only when at least two lanes
    independently show a stable cadence *and* coexist in repeated calendar periods. That
    concurrency requirement prevents a single subscription that merely changes billing day
    from being misclassified as two subscriptions.
    """

    if len(transactions) < MIN_MONTHLY_OCCURRENCES * 2:
        return None

    monthly_groups = _monthly_phase_groups(transactions)
    if _monthly_groups_are_concurrent(monthly_groups):
        lanes: list[TemporalLane] = []
        consumed_ids: set[str] = set()
        for phase, group in sorted(monthly_groups, key=lambda item: item[0]):
            if phase == 32:
                suffix = "monthly-month-end"
                signature = "monthly:month-end"
            else:
                suffix = f"monthly-day-{phase:02d}"
                signature = f"monthly:day-{phase:02d}"
            lanes.append(
                TemporalLane(
                    suffix=suffix,
                    basis="calendar_phase",
                    calendar_signature=signature,
                    transactions=tuple(sorted(group, key=lambda item: (item.transaction_date, item.id))),
                )
            )
            consumed_ids.update(item.id for item in group)

        residual = [item for item in transactions if item.id not in consumed_ids]
        if residual:
            lanes.append(
                TemporalLane(
                    suffix="temporal-residual",
                    basis="calendar_residual",
                    calendar_signature="unresolved",
                    transactions=tuple(sorted(residual, key=lambda item: (item.transaction_date, item.id))),
                )
            )
        return lanes

    weekly_groups = _weekly_groups(transactions)
    if _weekly_groups_are_concurrent(weekly_groups):
        weekday_names = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
        lanes = []
        consumed_ids: set[str] = set()
        for weekday, group in weekly_groups:
            name = weekday_names[weekday]
            lanes.append(
                TemporalLane(
                    suffix=f"weekly-{name}",
                    basis="calendar_phase",
                    calendar_signature=f"weekly:{name}",
                    transactions=tuple(sorted(group, key=lambda item: (item.transaction_date, item.id))),
                )
            )
            consumed_ids.update(item.id for item in group)
        residual = [item for item in transactions if item.id not in consumed_ids]
        if residual:
            lanes.append(
                TemporalLane(
                    suffix="temporal-residual",
                    basis="calendar_residual",
                    calendar_signature="unresolved",
                    transactions=tuple(sorted(residual, key=lambda item: (item.transaction_date, item.id))),
                )
            )
        return lanes

    return None
