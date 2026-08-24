from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Mapping

from app.services.historical_matching import _hungarian_minimize, recurring_match_utility


OCCURRENCE_MATCHING_STRATEGY = "hungarian_occurrence_max_weight_v1"
DEFAULT_DATE_TOLERANCE_DAYS = 7
DATE_UTILITY = 10_000
AMOUNT_UTILITY = 2_000
INVALID_UTILITY = -1_000_000
MONEY_QUANTUM = Decimal("0.01")


@dataclass(frozen=True)
class ExpectedOccurrence:
    label_id: str
    merchant: str
    cadence: str | None
    amount_min: Decimal | None
    amount_max: Decimal | None
    descriptor_contains: str | None
    calendar_signature: str | None
    occurrence_date: date
    expected_amount: Decimal | None


@dataclass(frozen=True)
class PredictedOccurrence:
    profile_index: int
    profile: Mapping[str, object]
    occurrence_date: date
    predicted_amount: Decimal


@dataclass(frozen=True)
class OccurrencePair:
    target_index: int
    prediction_index: int
    utility: int
    date_error_days: int
    amount_absolute_error: Decimal | None
    amount_percentage_error: Decimal | None


@dataclass(frozen=True)
class OccurrenceMatchingResult:
    pairs: tuple[OccurrencePair, ...]
    unmatched_target_indexes: tuple[int, ...]
    unmatched_prediction_indexes: tuple[int, ...]
    total_utility: int
    strategy: str = OCCURRENCE_MATCHING_STRATEGY


@dataclass(frozen=True)
class OccurrenceOutcome:
    status: str
    label_id: str | None
    stream_key: str | None
    expected_date: date | None
    predicted_date: date | None
    expected_amount: Decimal | None
    predicted_amount: Decimal | None
    date_error_days: int | None
    amount_absolute_error: Decimal | None
    amount_percentage_error: Decimal | None


def _target_sort_key(item: tuple[int, ExpectedOccurrence]) -> tuple[str, ...]:
    _, target = item
    return (
        target.occurrence_date.isoformat(),
        target.merchant,
        target.calendar_signature or "",
        target.descriptor_contains or "",
        target.cadence or "",
        str(target.expected_amount) if target.expected_amount is not None else "",
        target.label_id,
    )


def _prediction_sort_key(item: tuple[int, PredictedOccurrence]) -> tuple[str, ...]:
    _, prediction = item
    profile = prediction.profile
    return (
        prediction.occurrence_date.isoformat(),
        str(profile.get("canonicalMerchant") or ""),
        str(profile.get("streamCalendar") or ""),
        str(profile.get("streamDescriptor") or ""),
        str(profile.get("cadence") or ""),
        str(profile.get("medianAmount") or ""),
        str(profile.get("streamKey") or ""),
    )


def _occurrence_utility(
    target: ExpectedOccurrence,
    prediction: PredictedOccurrence,
    *,
    date_tolerance_days: int,
) -> int | None:
    base = recurring_match_utility(target, prediction.profile, active=True)
    if base is None:
        return None

    date_error = abs((prediction.occurrence_date - target.occurrence_date).days)
    if date_error > date_tolerance_days:
        return None

    utility = base + int(
        Decimal(DATE_UTILITY)
        * (Decimal(date_tolerance_days - date_error + 1) / Decimal(date_tolerance_days + 1))
    )

    if target.expected_amount is not None and target.expected_amount > Decimal("0"):
        amount_error = abs(prediction.predicted_amount - target.expected_amount)
        normalized_error = min(Decimal("1"), amount_error / target.expected_amount)
        utility += int(Decimal(AMOUNT_UTILITY) * (Decimal("1") - normalized_error))

    return utility


def optimal_occurrence_matching(
    targets: list[ExpectedOccurrence],
    predictions: list[PredictedOccurrence],
    *,
    date_tolerance_days: int = DEFAULT_DATE_TOLERANCE_DAYS,
) -> OccurrenceMatchingResult:
    if date_tolerance_days < 0:
        raise ValueError("date_tolerance_days must be non-negative")
    if not targets:
        return OccurrenceMatchingResult(
            pairs=(),
            unmatched_target_indexes=(),
            unmatched_prediction_indexes=tuple(range(len(predictions))),
            total_utility=0,
        )

    sorted_targets = sorted(enumerate(targets), key=_target_sort_key)
    sorted_predictions = sorted(enumerate(predictions), key=_prediction_sort_key)

    utilities: list[list[int]] = []
    for _, target in sorted_targets:
        row: list[int] = []
        for _, prediction in sorted_predictions:
            utility = _occurrence_utility(
                target,
                prediction,
                date_tolerance_days=date_tolerance_days,
            )
            row.append(utility if utility is not None else INVALID_UTILITY)
        row.extend([0] * len(sorted_targets))
        utilities.append(row)

    maximum = max(max(row) for row in utilities)
    costs = [[maximum - utility for utility in row] for row in utilities]
    selected_columns = _hungarian_minimize(costs)

    pairs: list[OccurrencePair] = []
    matched_targets: set[int] = set()
    matched_predictions: set[int] = set()
    total_utility = 0
    real_prediction_columns = len(sorted_predictions)

    for sorted_target_index, selected_column in enumerate(selected_columns):
        if selected_column < 0 or selected_column >= real_prediction_columns:
            continue
        utility = utilities[sorted_target_index][selected_column]
        if utility <= 0:
            continue

        original_target_index = sorted_targets[sorted_target_index][0]
        original_prediction_index = sorted_predictions[selected_column][0]
        target = targets[original_target_index]
        prediction = predictions[original_prediction_index]
        date_error_days = (prediction.occurrence_date - target.occurrence_date).days

        amount_absolute_error: Decimal | None = None
        amount_percentage_error: Decimal | None = None
        if target.expected_amount is not None:
            amount_absolute_error = abs(prediction.predicted_amount - target.expected_amount)
            if target.expected_amount != Decimal("0"):
                amount_percentage_error = amount_absolute_error / abs(target.expected_amount)

        pairs.append(
            OccurrencePair(
                target_index=original_target_index,
                prediction_index=original_prediction_index,
                utility=utility,
                date_error_days=date_error_days,
                amount_absolute_error=amount_absolute_error,
                amount_percentage_error=amount_percentage_error,
            )
        )
        matched_targets.add(original_target_index)
        matched_predictions.add(original_prediction_index)
        total_utility += utility

    pairs.sort(key=lambda item: (item.target_index, item.prediction_index))
    return OccurrenceMatchingResult(
        pairs=tuple(pairs),
        unmatched_target_indexes=tuple(
            index for index in range(len(targets)) if index not in matched_targets
        ),
        unmatched_prediction_indexes=tuple(
            index for index in range(len(predictions)) if index not in matched_predictions
        ),
        total_utility=total_utility,
    )


def build_occurrence_outcomes(
    targets: list[ExpectedOccurrence],
    predictions: list[PredictedOccurrence],
    matching: OccurrenceMatchingResult,
) -> list[OccurrenceOutcome]:
    outcomes: list[OccurrenceOutcome] = []
    for pair in matching.pairs:
        target = targets[pair.target_index]
        prediction = predictions[pair.prediction_index]
        outcomes.append(
            OccurrenceOutcome(
                status="matched",
                label_id=target.label_id,
                stream_key=str(prediction.profile.get("streamKey") or ""),
                expected_date=target.occurrence_date,
                predicted_date=prediction.occurrence_date,
                expected_amount=target.expected_amount,
                predicted_amount=prediction.predicted_amount,
                date_error_days=pair.date_error_days,
                amount_absolute_error=pair.amount_absolute_error,
                amount_percentage_error=pair.amount_percentage_error,
            )
        )

    for index in matching.unmatched_target_indexes:
        target = targets[index]
        outcomes.append(
            OccurrenceOutcome(
                status="missed",
                label_id=target.label_id,
                stream_key=None,
                expected_date=target.occurrence_date,
                predicted_date=None,
                expected_amount=target.expected_amount,
                predicted_amount=None,
                date_error_days=None,
                amount_absolute_error=None,
                amount_percentage_error=None,
            )
        )

    for index in matching.unmatched_prediction_indexes:
        prediction = predictions[index]
        outcomes.append(
            OccurrenceOutcome(
                status="extra",
                label_id=None,
                stream_key=str(prediction.profile.get("streamKey") or ""),
                expected_date=None,
                predicted_date=prediction.occurrence_date,
                expected_amount=None,
                predicted_amount=prediction.predicted_amount,
                date_error_days=None,
                amount_absolute_error=None,
                amount_percentage_error=None,
            )
        )

    return outcomes


def _money(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return format(value.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP), ".2f")


def _median(values: list[Decimal]) -> Decimal:
    ordered = sorted(values)
    midpoint = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[midpoint]
    return (ordered[midpoint - 1] + ordered[midpoint]) / Decimal("2")


def occurrence_metrics(outcomes: list[OccurrenceOutcome]) -> dict[str, object]:
    matched = [item for item in outcomes if item.status == "matched"]
    missed = [item for item in outcomes if item.status == "missed"]
    extra = [item for item in outcomes if item.status == "extra"]
    expected_count = len(matched) + len(missed)
    predicted_count = len(matched) + len(extra)

    precision = len(matched) / predicted_count if predicted_count else 0.0
    recall = len(matched) / expected_count if expected_count else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0

    absolute_date_errors = [Decimal(abs(item.date_error_days)) for item in matched if item.date_error_days is not None]
    signed_date_errors = [Decimal(item.date_error_days) for item in matched if item.date_error_days is not None]
    amount_errors = [item.amount_absolute_error for item in matched if item.amount_absolute_error is not None]
    amount_percentage_errors = [
        item.amount_percentage_error
        for item in matched
        if item.amount_percentage_error is not None
    ]

    date_mae = (
        sum(absolute_date_errors, Decimal("0")) / Decimal(len(absolute_date_errors))
        if absolute_date_errors
        else None
    )
    date_bias = (
        sum(signed_date_errors, Decimal("0")) / Decimal(len(signed_date_errors))
        if signed_date_errors
        else None
    )
    amount_mae = (
        sum(amount_errors, Decimal("0")) / Decimal(len(amount_errors))
        if amount_errors
        else None
    )
    amount_mape = (
        sum(amount_percentage_errors, Decimal("0")) / Decimal(len(amount_percentage_errors))
        if amount_percentage_errors
        else None
    )

    return {
        "expectedOccurrences": expected_count,
        "predictedOccurrences": predicted_count,
        "matchedOccurrences": len(matched),
        "missedOccurrences": len(missed),
        "extraPredictions": len(extra),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "dateMaeDays": round(float(date_mae), 3) if date_mae is not None else None,
        "dateMedianAbsoluteErrorDays": (
            round(float(_median(absolute_date_errors)), 3) if absolute_date_errors else None
        ),
        "dateMeanSignedErrorDays": round(float(date_bias), 3) if date_bias is not None else None,
        "within3DaysRate": (
            round(
                sum(value <= Decimal("3") for value in absolute_date_errors)
                / len(absolute_date_errors),
                4,
            )
            if absolute_date_errors
            else None
        ),
        "amountEvaluatedOccurrences": len(amount_errors),
        "amountMae": _money(amount_mae),
        "amountMape": round(float(amount_mape), 4) if amount_mape is not None else None,
    }


def serialize_occurrence_outcomes(outcomes: list[OccurrenceOutcome]) -> list[dict[str, object]]:
    serialized: list[dict[str, object]] = []
    for item in outcomes:
        serialized.append(
            {
                "status": item.status,
                "labelId": item.label_id,
                "streamKey": item.stream_key,
                "expectedDate": item.expected_date.isoformat() if item.expected_date else None,
                "predictedDate": item.predicted_date.isoformat() if item.predicted_date else None,
                "dateErrorDays": item.date_error_days,
                "expectedAmount": _money(item.expected_amount),
                "predictedAmount": _money(item.predicted_amount),
                "amountAbsoluteError": _money(item.amount_absolute_error),
                "amountPercentageError": (
                    round(float(item.amount_percentage_error), 4)
                    if item.amount_percentage_error is not None
                    else None
                ),
            }
        )
    return sorted(
        serialized,
        key=lambda item: (
            str(item.get("expectedDate") or item.get("predictedDate") or ""),
            str(item.get("labelId") or ""),
            str(item.get("streamKey") or ""),
        ),
    )
