from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Mapping, Protocol


INVALID_UTILITY = -1_000_000
ACTIVE_LABEL_BONUS = 100_000
MERCHANT_UTILITY = 10_000
CALENDAR_UTILITY = 5_000
DESCRIPTOR_UTILITY = 3_500
CADENCE_UTILITY = 2_500
AMOUNT_SPECIFICITY_UTILITY = 1_000
AMOUNT_CLOSENESS_UTILITY = 1_000
MATCHING_STRATEGY = "hungarian_max_weight_v1"


class RecurringLabelLike(Protocol):
    label_id: str
    merchant: str
    cadence: str | None
    amount_min: Decimal | None
    amount_max: Decimal | None
    descriptor_contains: str | None
    calendar_signature: str | None


@dataclass(frozen=True)
class MatchingPair:
    label_index: int
    profile_index: int
    utility: int


@dataclass(frozen=True)
class MatchingResult:
    pairs: tuple[MatchingPair, ...]
    unmatched_label_indexes: tuple[int, ...]
    unmatched_profile_indexes: tuple[int, ...]
    total_utility: int
    strategy: str = MATCHING_STRATEGY


def _profile_amount(profile: Mapping[str, object]) -> Decimal:
    return Decimal(str(profile.get("medianAmount", "0")))


def _label_sort_key(item: tuple[int, RecurringLabelLike]) -> tuple[str, ...]:
    _, label = item
    return (
        label.merchant,
        label.calendar_signature or "",
        label.descriptor_contains or "",
        label.cadence or "",
        str(label.amount_min) if label.amount_min is not None else "",
        str(label.amount_max) if label.amount_max is not None else "",
        label.label_id,
    )


def _profile_sort_key(item: tuple[int, Mapping[str, object]]) -> tuple[str, ...]:
    _, profile = item
    return (
        str(profile.get("canonicalMerchant") or ""),
        str(profile.get("streamCalendar") or ""),
        str(profile.get("streamDescriptor") or ""),
        str(profile.get("cadence") or ""),
        str(profile.get("medianAmount") or ""),
        str(profile.get("streamKey") or ""),
    )


def _amount_utility(label: RecurringLabelLike, amount: Decimal) -> int | None:
    lower = label.amount_min
    upper = label.amount_max
    if lower is not None and amount < lower:
        return None
    if upper is not None and amount > upper:
        return None
    if lower is None and upper is None:
        return 0

    utility = AMOUNT_SPECIFICITY_UTILITY
    if lower is not None and upper is not None:
        centre = (lower + upper) / Decimal("2")
        half_span = max((upper - lower) / Decimal("2"), Decimal("0.01"))
        normalized_distance = min(Decimal("1"), abs(amount - centre) / half_span)
        closeness = Decimal(AMOUNT_CLOSENESS_UTILITY) * (Decimal("1") - normalized_distance)
        utility += int(closeness.quantize(Decimal("1")))
    return utility


def recurring_match_utility(
    label: RecurringLabelLike,
    profile: Mapping[str, object],
    *,
    active: bool,
) -> int | None:
    """Return a deterministic utility for one label/profile edge.

    Explicit ground-truth fields are hard compatibility constraints. Among compatible
    candidates, higher utility represents a more specific and closer match. Active labels
    receive a dominating bonus so a cancelled lifecycle cannot consume the one prediction
    belonging to a concurrently active/reactivated label.
    """

    if str(profile.get("canonicalMerchant") or "") != label.merchant:
        return None

    utility = MERCHANT_UTILITY + (ACTIVE_LABEL_BONUS if active else 0)

    if label.calendar_signature:
        if str(profile.get("streamCalendar") or "") != label.calendar_signature:
            return None
        utility += CALENDAR_UTILITY

    if label.descriptor_contains:
        descriptor = str(profile.get("streamDescriptor") or "").casefold()
        if label.descriptor_contains not in descriptor:
            return None
        utility += DESCRIPTOR_UTILITY

    if label.cadence:
        if str(profile.get("cadence") or "") != label.cadence:
            return None
        utility += CADENCE_UTILITY

    amount_utility = _amount_utility(label, _profile_amount(profile))
    if amount_utility is None:
        return None
    utility += amount_utility
    return utility


def _hungarian_minimize(costs: list[list[int]]) -> list[int]:
    """Return the selected column for each row using O(n^3) Hungarian assignment.

    The implementation expects rows <= columns. Callers append one zero-utility dummy
    column per label, which makes unmatched labels a first-class assignment instead of
    forcing an incompatible profile edge.
    """

    if not costs:
        return []
    row_count = len(costs)
    column_count = len(costs[0])
    if row_count > column_count:
        raise ValueError("Hungarian assignment requires rows <= columns")

    u = [0] * (row_count + 1)
    v = [0] * (column_count + 1)
    p = [0] * (column_count + 1)
    way = [0] * (column_count + 1)

    for row in range(1, row_count + 1):
        p[0] = row
        column0 = 0
        minv = [10**18] * (column_count + 1)
        used = [False] * (column_count + 1)

        while True:
            used[column0] = True
            row0 = p[column0]
            delta = 10**18
            column1 = 0
            for column in range(1, column_count + 1):
                if used[column]:
                    continue
                current = costs[row0 - 1][column - 1] - u[row0] - v[column]
                if current < minv[column]:
                    minv[column] = current
                    way[column] = column0
                if minv[column] < delta:
                    delta = minv[column]
                    column1 = column

            for column in range(column_count + 1):
                if used[column]:
                    u[p[column]] += delta
                    v[column] -= delta
                else:
                    minv[column] -= delta
            column0 = column1
            if p[column0] == 0:
                break

        while True:
            column1 = way[column0]
            p[column0] = p[column1]
            column0 = column1
            if column0 == 0:
                break

    assignment = [-1] * row_count
    for column in range(1, column_count + 1):
        if p[column] != 0:
            assignment[p[column] - 1] = column - 1
    return assignment


def optimal_recurring_matching(
    labels: list[RecurringLabelLike],
    profiles: list[Mapping[str, object]],
    *,
    active_label_indexes: set[int],
) -> MatchingResult:
    """Find the globally optimal one-to-one recurring label/profile assignment.

    Inputs are canonically sorted before building the matrix, so tie-breaking does not
    depend on the order in which labels or predicted profiles happened to be produced.
    Dummy columns allow labels to remain unmatched; incompatible edges are always worse
    than a dummy assignment.
    """

    if not labels:
        return MatchingResult(
            pairs=(),
            unmatched_label_indexes=(),
            unmatched_profile_indexes=tuple(range(len(profiles))),
            total_utility=0,
        )

    sorted_labels = sorted(enumerate(labels), key=_label_sort_key)
    sorted_profiles = sorted(enumerate(profiles), key=_profile_sort_key)

    utilities: list[list[int]] = []
    for original_label_index, label in sorted_labels:
        row: list[int] = []
        for _, profile in sorted_profiles:
            utility = recurring_match_utility(
                label,
                profile,
                active=original_label_index in active_label_indexes,
            )
            row.append(utility if utility is not None else INVALID_UTILITY)
        row.extend([0] * len(sorted_labels))
        utilities.append(row)

    maximum = max(max(row) for row in utilities)
    costs = [[maximum - utility for utility in row] for row in utilities]
    selected_columns = _hungarian_minimize(costs)

    pairs: list[MatchingPair] = []
    matched_labels: set[int] = set()
    matched_profiles: set[int] = set()
    total_utility = 0
    profile_column_count = len(sorted_profiles)

    for sorted_label_index, selected_column in enumerate(selected_columns):
        if selected_column < 0 or selected_column >= profile_column_count:
            continue
        utility = utilities[sorted_label_index][selected_column]
        if utility <= 0:
            continue
        original_label_index = sorted_labels[sorted_label_index][0]
        original_profile_index = sorted_profiles[selected_column][0]
        pairs.append(
            MatchingPair(
                label_index=original_label_index,
                profile_index=original_profile_index,
                utility=utility,
            )
        )
        matched_labels.add(original_label_index)
        matched_profiles.add(original_profile_index)
        total_utility += utility

    pairs.sort(key=lambda item: (item.label_index, item.profile_index))
    return MatchingResult(
        pairs=tuple(pairs),
        unmatched_label_indexes=tuple(index for index in range(len(labels)) if index not in matched_labels),
        unmatched_profile_indexes=tuple(index for index in range(len(profiles)) if index not in matched_profiles),
        total_utility=total_utility,
    )
