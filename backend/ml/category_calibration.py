from __future__ import annotations

from math import log
from typing import Sequence

from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression

from ml.category_classifier import RANDOM_STATE


_EPSILON = 1e-6


def _logit(value: float) -> float:
    clipped = min(max(value, _EPSILON), 1.0 - _EPSILON)
    return log(clipped / (1.0 - clipped))


def _renormalize(rows: Sequence[dict[str, float]], classes: Sequence[str]) -> list[dict[str, float]]:
    result: list[dict[str, float]] = []
    for row in rows:
        total = sum(max(0.0, float(row.get(label, 0.0))) for label in classes)
        if total <= 0:
            uniform = 1.0 / len(classes)
            result.append({label: uniform for label in classes})
        else:
            result.append(
                {label: max(0.0, float(row.get(label, 0.0))) / total for label in classes}
            )
    return result


def multiclass_brier_score(
    probability_rows: Sequence[dict[str, float]],
    actual: Sequence[str],
    classes: Sequence[str],
) -> float:
    if len(probability_rows) != len(actual):
        raise ValueError("probability rows and labels must have the same length")
    if not actual:
        return 0.0
    total = 0.0
    for row, label in zip(probability_rows, actual, strict=True):
        total += sum(
            (float(row.get(category, 0.0)) - (1.0 if category == label else 0.0)) ** 2
            for category in classes
        )
    return total / len(actual)


def reliability_bins(
    probability_rows: Sequence[dict[str, float]],
    actual: Sequence[str],
    *,
    bins: int = 10,
) -> list[dict[str, float | int]]:
    if len(probability_rows) != len(actual):
        raise ValueError("probability rows and labels must have the same length")
    buckets: list[list[tuple[float, bool]]] = [[] for _ in range(bins)]
    for row, label in zip(probability_rows, actual, strict=True):
        predicted, confidence = max(row.items(), key=lambda item: item[1])
        index = min(int(confidence * bins), bins - 1)
        buckets[index].append((float(confidence), predicted == label))

    result: list[dict[str, float | int]] = []
    for index, values in enumerate(buckets):
        count = len(values)
        result.append(
            {
                "lower": round(index / bins, 3),
                "upper": round((index + 1) / bins, 3),
                "count": count,
                "meanConfidence": (
                    round(sum(value[0] for value in values) / count, 6) if count else 0.0
                ),
                "accuracy": (
                    round(sum(1 for _, correct in values if correct) / count, 6)
                    if count
                    else 0.0
                ),
            }
        )
    return result


def expected_calibration_error(
    probability_rows: Sequence[dict[str, float]],
    actual: Sequence[str],
    *,
    bins: int = 10,
) -> float:
    if not actual:
        return 0.0
    diagram = reliability_bins(probability_rows, actual, bins=bins)
    return sum(
        (int(bucket["count"]) / len(actual))
        * abs(float(bucket["accuracy"]) - float(bucket["meanConfidence"]))
        for bucket in diagram
    )


def platt_calibrate(
    calibration_rows: Sequence[dict[str, float]],
    calibration_actual: Sequence[str],
    evaluation_rows: Sequence[dict[str, float]],
    classes: Sequence[str],
) -> list[dict[str, float]]:
    calibrated = [{label: 0.0 for label in classes} for _ in evaluation_rows]
    for label in classes:
        targets = [1 if actual == label else 0 for actual in calibration_actual]
        if len(set(targets)) < 2:
            for output, row in zip(calibrated, evaluation_rows, strict=True):
                output[label] = row[label]
            continue
        model = LogisticRegression(solver="lbfgs", random_state=RANDOM_STATE)
        model.fit([[_logit(row[label])] for row in calibration_rows], targets)
        probabilities = model.predict_proba(
            [[_logit(row[label])] for row in evaluation_rows]
        )[:, 1]
        for output, probability in zip(calibrated, probabilities, strict=True):
            output[label] = float(probability)
    return _renormalize(calibrated, classes)


def isotonic_calibrate(
    calibration_rows: Sequence[dict[str, float]],
    calibration_actual: Sequence[str],
    evaluation_rows: Sequence[dict[str, float]],
    classes: Sequence[str],
) -> list[dict[str, float]]:
    calibrated = [{label: 0.0 for label in classes} for _ in evaluation_rows]
    for label in classes:
        targets = [1 if actual == label else 0 for actual in calibration_actual]
        if len(set(targets)) < 2:
            for output, row in zip(calibrated, evaluation_rows, strict=True):
                output[label] = row[label]
            continue
        model = IsotonicRegression(out_of_bounds="clip")
        model.fit([row[label] for row in calibration_rows], targets)
        probabilities = model.predict([row[label] for row in evaluation_rows])
        for output, probability in zip(calibrated, probabilities, strict=True):
            output[label] = float(probability)
    return _renormalize(calibrated, classes)


def calibration_metrics(
    probability_rows: Sequence[dict[str, float]],
    actual: Sequence[str],
    classes: Sequence[str],
) -> dict[str, object]:
    return {
        "brierScore": round(multiclass_brier_score(probability_rows, actual, classes), 6),
        "expectedCalibrationError": round(
            expected_calibration_error(probability_rows, actual), 6
        ),
        "reliabilityDiagram": reliability_bins(probability_rows, actual),
    }
