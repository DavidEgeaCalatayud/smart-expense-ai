from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
import json
from pathlib import Path
import re
from typing import Any, Iterable, Sequence

from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score

from ml.category_classifier import FEATURE_POLICY, MODEL_VERSION, CategoryClassifier

REPORT_VERSION = "category-classifier-evaluation-v1"
HOLDOUT_START_MONTH = "2025-07"
HOLDOUT_END_MONTH = "2025-12"


@dataclass(frozen=True)
class LabelledTransaction:
    transaction_id: str
    merchant: str
    category: str
    date: str

    @property
    def month(self) -> str:
        return self.date[:7]


def _normalise_merchant(value: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", value.lower()))


def load_category_examples(dataset_dir: Path) -> list[LabelledTransaction]:
    transactions_path = dataset_dir / "transactions_v1.jsonl"
    categories_path = dataset_dir / "labels" / "categories.json"
    transactions = [
        json.loads(line)
        for line in transactions_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    category_payload = json.loads(categories_path.read_text(encoding="utf-8"))
    if category_payload.get("coverage") != "complete":
        raise ValueError("category labels must declare complete coverage")
    labels = category_payload.get("labels", {})
    transaction_ids = {str(item["id"]) for item in transactions}
    label_ids = {str(identifier) for identifier in labels}
    if transaction_ids != label_ids:
        missing = sorted(transaction_ids - label_ids)
        extra = sorted(label_ids - transaction_ids)
        raise ValueError(
            f"category labels do not match transactions: missing={missing[:5]} extra={extra[:5]}"
        )
    return [
        LabelledTransaction(
            transaction_id=str(item["id"]),
            merchant=str(item["merchant"]),
            category=str(labels[str(item["id"])]),
            date=str(item["date"]),
        )
        for item in transactions
    ]


def _partition(
    examples: Sequence[LabelledTransaction],
) -> dict[str, list[LabelledTransaction]]:
    result: dict[str, list[LabelledTransaction]] = {
        "history": [],
        "calibration": [],
        "validation": [],
        "holdout": [],
    }
    for item in examples:
        month = item.month
        if month <= "2023-12":
            result["history"].append(item)
        elif "2024-01" <= month <= "2024-12":
            result["calibration"].append(item)
        elif "2025-01" <= month <= "2025-06":
            result["validation"].append(item)
        elif HOLDOUT_START_MONTH <= month <= HOLDOUT_END_MONTH:
            result["holdout"].append(item)
        else:
            raise ValueError(f"transaction outside declared benchmark split: {item.date}")
    return result


def _category_counts(examples: Iterable[LabelledTransaction]) -> dict[str, int]:
    return dict(sorted(Counter(item.category for item in examples).items()))


def _slice_metrics(actual: Sequence[str], predicted: Sequence[str]) -> dict[str, Any]:
    if not actual:
        return {"support": 0, "accuracy": None, "macroF1": None}
    return {
        "support": len(actual),
        "accuracy": round(float(accuracy_score(actual, predicted)), 6),
        "macroF1": round(float(f1_score(actual, predicted, average="macro", zero_division=0)), 6),
    }


def evaluate_predictions(
    *,
    train: Sequence[LabelledTransaction],
    evaluation: Sequence[LabelledTransaction],
) -> dict[str, Any]:
    classifier = CategoryClassifier().fit(
        [item.merchant for item in train],
        [item.category for item in train],
    )
    actual = [item.category for item in evaluation]
    predicted = classifier.predict(item.merchant for item in evaluation)
    labels = sorted(set(item.category for item in train) | set(actual))
    raw_report = classification_report(
        actual,
        predicted,
        labels=labels,
        output_dict=True,
        zero_division=0,
    )
    matrix = confusion_matrix(actual, predicted, labels=labels)

    train_merchants = {_normalise_merchant(item.merchant) for item in train}
    seen_actual: list[str] = []
    seen_predicted: list[str] = []
    unseen_actual: list[str] = []
    unseen_predicted: list[str] = []
    for item, predicted_category in zip(evaluation, predicted, strict=True):
        if _normalise_merchant(item.merchant) in train_merchants:
            seen_actual.append(item.category)
            seen_predicted.append(predicted_category)
        else:
            unseen_actual.append(item.category)
            unseen_predicted.append(predicted_category)

    per_category: dict[str, dict[str, float | int]] = {}
    for label in labels:
        row = raw_report[label]
        per_category[label] = {
            "precision": round(float(row["precision"]), 6),
            "recall": round(float(row["recall"]), 6),
            "f1": round(float(row["f1-score"]), 6),
            "support": int(row["support"]),
        }

    return {
        "fitSamples": len(train),
        "evaluationSamples": len(evaluation),
        "fitCategoryCounts": _category_counts(train),
        "evaluationCategoryCounts": _category_counts(evaluation),
        "metrics": {
            "accuracy": round(float(accuracy_score(actual, predicted)), 6),
            "macroF1": round(float(f1_score(actual, predicted, average="macro", zero_division=0)), 6),
            "weightedF1": round(float(f1_score(actual, predicted, average="weighted", zero_division=0)), 6),
        },
        "perCategory": per_category,
        "confusionMatrix": {
            "labels": labels,
            "matrix": [[int(value) for value in row] for row in matrix.tolist()],
        },
        "merchantCoverage": {
            "seen": _slice_metrics(seen_actual, seen_predicted),
            "unseen": _slice_metrics(unseen_actual, unseen_predicted),
        },
    }


def build_category_evaluation_report(dataset_dir: Path) -> dict[str, Any]:
    examples = load_category_examples(dataset_dir)
    parts = _partition(examples)
    calibration = evaluate_predictions(
        train=parts["history"],
        evaluation=parts["calibration"],
    )
    validation = evaluate_predictions(
        train=[*parts["history"], *parts["calibration"]],
        evaluation=parts["validation"],
    )
    return {
        "reportVersion": REPORT_VERSION,
        "datasetVersion": "financial-benchmark-v1",
        "model": {
            "version": MODEL_VERSION,
            "algorithm": "TF-IDF + Logistic Regression",
            "featurePolicy": FEATURE_POLICY,
            "featureFields": ["merchant"],
            "probabilitySemantics": "uncalibrated_logistic_regression_probability",
        },
        "labelCoverage": {
            "total": len(examples),
            "byCategory": _category_counts(examples),
            "bySplit": {name: len(values) for name, values in parts.items()},
        },
        "calibration": calibration,
        "validation": validation,
        "holdout": {
            "status": "sealed",
            "range": {
                "startMonth": HOLDOUT_START_MONTH,
                "endMonth": HOLDOUT_END_MONTH,
            },
            "labelCount": len(parts["holdout"]),
            "usedForFit": False,
            "usedForMetrics": False,
        },
        "limitations": [
            "The benchmark is deterministic curated synthetic data, not real banking data.",
            "Repeated merchants across time can make temporal validation easier than true merchant cold-start classification.",
            "The model uses merchant descriptor text only and does not yet incorporate user corrections or personalised category preferences.",
            "Logistic Regression probabilities are not calibrated confidence estimates.",
        ],
    }
