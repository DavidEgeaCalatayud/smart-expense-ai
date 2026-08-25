from __future__ import annotations

from dataclasses import dataclass
from random import Random


DEFAULT_CONFIDENCE_LEVEL = 0.95
DEFAULT_BOOTSTRAP_ITERATIONS = 1000
DEFAULT_BOOTSTRAP_SEED = 20260825
BOOTSTRAP_METHOD = "month_block_percentile_bootstrap_v1"


@dataclass(frozen=True)
class BootstrapConfig:
    level: float = DEFAULT_CONFIDENCE_LEVEL
    iterations: int = DEFAULT_BOOTSTRAP_ITERATIONS
    seed: int = DEFAULT_BOOTSTRAP_SEED

    def validate(self) -> None:
        if not 0.5 < self.level < 1.0:
            raise ValueError("bootstrap confidence level must be between 0.5 and 1")
        if self.iterations < 200:
            raise ValueError("bootstrap iterations must be at least 200")


def _quantile(values: list[float], probability: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    position = probability * (len(ordered) - 1)
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    weight = position - lower
    return ordered[lower] * (1.0 - weight) + ordered[upper] * weight


def _interval(values: list[float], level: float) -> dict[str, float]:
    tail = (1.0 - level) / 2.0
    return {
        "lower": round(_quantile(values, tail), 4),
        "upper": round(_quantile(values, 1.0 - tail), 4),
    }


def _block_reliability(blocks: int) -> dict[str, str | int]:
    if blocks < 5:
        return {
            "rating": "very_low",
            "warning": "Fewer than 5 temporal blocks; interval width/stability is not reliable.",
            "recommendedMinimumBlocks": 10,
        }
    if blocks < 10:
        return {
            "rating": "limited",
            "warning": "Fewer than 10 temporal blocks; interpret intervals cautiously.",
            "recommendedMinimumBlocks": 10,
        }
    return {
        "rating": "standard",
        "warning": "",
        "recommendedMinimumBlocks": 10,
    }


def _binary_from_counts(
    tp: int,
    fp: int,
    fn: int,
    tn: int,
    transaction_count: int,
) -> dict[str, float]:
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    fp100 = (fp / transaction_count * 100.0) if transaction_count else 0.0
    return {
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "falsePositivesPer100Transactions": fp100,
    }


def _empty_confidence(config: BootstrapConfig, support: int) -> dict[str, object]:
    return {
        "method": BOOTSTRAP_METHOD,
        "level": config.level,
        "iterations": config.iterations,
        "seed": config.seed,
        "blocks": 0,
        "support": support,
        "reliability": _block_reliability(0),
        "intervals": {},
    }


def bootstrap_binary_fold_metrics(
    folds: list[dict[str, object]],
    metric_key: str,
    config: BootstrapConfig,
) -> dict[str, object]:
    """Resample entire monthly folds, preserving within-month dependence."""

    config.validate()
    eligible = [
        fold for fold in folds
        if isinstance(fold.get(metric_key), dict)
    ]
    support = 0
    for fold in eligible:
        metrics = fold[metric_key]
        assert isinstance(metrics, dict)
        support += (
            int(metrics.get("truePositives", 0))
            + int(metrics.get("falsePositives", 0))
            + int(metrics.get("falseNegatives", 0))
            + int(metrics.get("trueNegatives", 0))
        )

    if not eligible:
        return _empty_confidence(config, support)

    rng = Random(config.seed)
    samples: dict[str, list[float]] = {
        "precision": [],
        "recall": [],
        "f1": [],
        "falsePositivesPer100Transactions": [],
    }
    for _ in range(config.iterations):
        selected = [eligible[rng.randrange(len(eligible))] for _ in range(len(eligible))]
        tp = fp = fn = tn = transaction_count = 0
        for fold in selected:
            metrics = fold[metric_key]
            assert isinstance(metrics, dict)
            tp += int(metrics.get("truePositives", 0))
            fp += int(metrics.get("falsePositives", 0))
            fn += int(metrics.get("falseNegatives", 0))
            tn += int(metrics.get("trueNegatives", 0))
            transaction_count += int(fold.get("evaluationTransactions", 0))
        values = _binary_from_counts(tp, fp, fn, tn, transaction_count)
        for name, value in values.items():
            samples[name].append(value)

    blocks = len(eligible)
    return {
        "method": BOOTSTRAP_METHOD,
        "level": config.level,
        "iterations": config.iterations,
        "seed": config.seed,
        "blocks": blocks,
        "support": support,
        "reliability": _block_reliability(blocks),
        "intervals": {
            name: _interval(values, config.level)
            for name, values in samples.items()
        },
    }


def _occurrence_from_counts(matched: int, missed: int, extra: int) -> dict[str, float]:
    expected = matched + missed
    predicted = matched + extra
    precision = matched / predicted if predicted else 0.0
    recall = matched / expected if expected else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"precision": precision, "recall": recall, "f1": f1}


def bootstrap_occurrence_fold_metrics(
    folds: list[dict[str, object]],
    config: BootstrapConfig,
) -> dict[str, object]:
    config.validate()
    eligible: list[dict[str, object]] = []
    support = 0
    for fold in folds:
        occurrence = fold.get("occurrences")
        if not isinstance(occurrence, dict) or not occurrence.get("evaluated"):
            continue
        metrics = occurrence.get("metrics")
        if not isinstance(metrics, dict):
            continue
        eligible.append(fold)
        support += int(metrics.get("expectedOccurrences", 0))

    if not eligible:
        return _empty_confidence(config, support)

    rng = Random(config.seed + 17)
    samples: dict[str, list[float]] = {"precision": [], "recall": [], "f1": []}
    for _ in range(config.iterations):
        selected = [eligible[rng.randrange(len(eligible))] for _ in range(len(eligible))]
        matched = missed = extra = 0
        for fold in selected:
            occurrence = fold["occurrences"]
            assert isinstance(occurrence, dict)
            metrics = occurrence["metrics"]
            assert isinstance(metrics, dict)
            matched += int(metrics.get("matchedOccurrences", 0))
            missed += int(metrics.get("missedOccurrences", 0))
            extra += int(metrics.get("extraPredictions", 0))
        values = _occurrence_from_counts(matched, missed, extra)
        for name, value in values.items():
            samples[name].append(value)

    blocks = len(eligible)
    return {
        "method": BOOTSTRAP_METHOD,
        "level": config.level,
        "iterations": config.iterations,
        "seed": config.seed,
        "blocks": blocks,
        "support": support,
        "reliability": _block_reliability(blocks),
        "intervals": {
            name: _interval(values, config.level)
            for name, values in samples.items()
        },
    }
