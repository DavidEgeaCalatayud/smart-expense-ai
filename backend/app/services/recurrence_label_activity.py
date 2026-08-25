from __future__ import annotations

from calendar import monthrange
from datetime import date, timedelta
from statistics import median


MIN_STREAM_EVIDENCE_OCCURRENCES = 3
MAX_MONTH_BOUNDARY_SHIFT_DAYS = 4
MAX_MONTH_START_TARGET_DAY = 4
CADENCE_MONTH_STEPS = {
    "monthly": 1,
    "quarterly": 3,
    "yearly": 12,
}
RECURRENCE_LABEL_ACTIVITY_POLICY = "cadence_continuity_nominal_boundary_v2"


def _month_index(value: date | str) -> int:
    if isinstance(value, str):
        year, month = (int(part) for part in value.split("-")[:2])
    else:
        year, month = value.year, value.month
    return year * 12 + month - 1


def _next_month_target(value: date, target_day: int) -> date:
    if value.month == 12:
        year, month = value.year + 1, 1
    else:
        year, month = value.year, value.month + 1
    return date(year, month, min(target_day, monthrange(year, month)[1]))


def _month_start_target_day(values: list[date]) -> int | None:
    if len(values) < 2:
        return None
    target_day = int(round(median(item.day for item in values)))
    return target_day if target_day <= MAX_MONTH_START_TARGET_DAY else None


def _normalize_boundary(value: date, target_day: int | None) -> date:
    if target_day is None or value.day < 27:
        return value
    nominal = _next_month_target(value, target_day)
    if timedelta(0) < nominal - value <= timedelta(days=MAX_MONTH_BOUNDARY_SHIFT_DAYS):
        return nominal
    return value


def recurring_stream_active_in(
    expected_occurrences: tuple[date, ...] | list[date],
    cadence: str | None,
    month_key: str,
    *,
    minimum_evidence_occurrences: int = MIN_STREAM_EVIDENCE_OCCURRENCES,
) -> bool:
    """Return stream-level activity using only labels bank-visible by the fold month.

    Month-start charges may be posted a few days early into the preceding calendar month.
    Those observations are available as evidence but are assigned to their inferred nominal
    billing month before cadence continuity is evaluated. This prevents a nominal March 1
    charge posted on February 28 from making February active and March inactive.
    """

    current_index = _month_index(month_key)
    bank_visible = [
        value for value in expected_occurrences if _month_index(value) <= current_index
    ]
    if len(bank_visible) < minimum_evidence_occurrences:
        return False

    cadence_step = CADENCE_MONTH_STEPS.get(cadence or "")
    if cadence_step is None:
        return any(value.strftime("%Y-%m") == month_key for value in bank_visible)

    boundary_target_day = _month_start_target_day(bank_visible)
    nominal_visible = sorted(
        {
            _normalize_boundary(value, boundary_target_day)
            for value in bank_visible
            if _month_index(_normalize_boundary(value, boundary_target_day)) <= current_index
        }
    )
    if len(nominal_visible) < minimum_evidence_occurrences:
        return False

    last_observed_index = max(_month_index(value) for value in nominal_visible)
    return current_index - last_observed_index < cadence_step


__all__ = [
    "CADENCE_MONTH_STEPS",
    "MIN_STREAM_EVIDENCE_OCCURRENCES",
    "RECURRENCE_LABEL_ACTIVITY_POLICY",
    "recurring_stream_active_in",
]
