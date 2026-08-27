from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from hashlib import sha256
import json
from pathlib import Path
import re
from typing import Any, Iterable, Sequence

from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score

from app.services.evaluation_confidence import BootstrapConfig
from app.services.historical_evaluation_protocol import EvaluationParameters
from app.services.historical_evaluation_runner import (
    run_development_evaluation,
    run_holdout_evaluation,
)
from app.services.intelligence_rules import TransactionSnapshot
from app.services.intelligence_rules_v2 import run_financial_intelligence_rules_v2
from app.services.merchant_canonicalization import build_merchant_identity_map
from ml.category_calibration import (
    calibration_metrics,
    isotonic_calibrate,
    platt_calibrate,
)
from ml.category_runtime import (
    FEATURE_POLICY,
    MODEL_VERSION,
    get_runtime_classifier,
    runtime_training_examples,
)


REPORT_VERSION = "private-real-data-evaluation-v1"
DATASET_CONTRACT_VERSION = "private-real-data-v1"
_ALLOWED_TYPES = {"expense", "income"}
_MONTH_RE = re.compile(r"^\d{4}-\d{2}$")


@dataclass(frozen=True)
class MonthRange:
    start_month: str
    end_month: str

    def contains(self, value: date) -> bool:
        month = value.strftime("%Y-%m")
        return self.start_month <= month <= self.end_month

    def as_dict(self) -> dict[str, str]:
        return {"startMonth": self.start_month, "endMonth": self.end_month}


@dataclass(frozen=True)
class PrivateTransaction:
    transaction_id: str
    merchant: str
    amount: Decimal
    transaction_date: date
    transaction_type: str
    category: str

    @property
    def month(self) -> str:
        return self.transaction_date.strftime("%Y-%m")

    def snapshot(self) -> TransactionSnapshot:
        return TransactionSnapshot(
            id=self.transaction_id,
            merchant=self.merchant,
            amount=self.amount,
            transaction_date=self.transaction_date,
            category=self.category,
        )


@dataclass(frozen=True)
class PrivateDataset:
    root: Path
    dataset_version: str
    calibration: MonthRange
    validation: MonthRange
    holdout: MonthRange
    occurrence_evaluation_months: tuple[str, ...]
    recurring_threshold_candidates: tuple[str, ...]
    transactions: tuple[PrivateTransaction, ...]
    anomaly_labels: dict[str, dict[str, bool]]
    recurring_labels: tuple[dict[str, Any], ...]
    fingerprint: str


def _load_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path.name} must contain one JSON object")
    return payload


def _load_jsonl(path: Path, *, required: bool = True) -> list[dict[str, Any]]:
    if not path.exists():
        if required:
            raise ValueError(f"missing required private dataset file: {path.name}")
        return []
    rows: list[dict[str, Any]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path.name}:{line_number} is not valid JSON") from exc
        if not isinstance(value, dict):
            raise ValueError(f"{path.name}:{line_number} must contain one JSON object")
        rows.append(value)
    return rows


def _parse_month_range(raw: object, name: str) -> MonthRange:
    if not isinstance(raw, dict):
        raise ValueError(f"evaluation.splits.{name} must be an object")
    start = str(raw.get("startMonth", ""))
    end = str(raw.get("endMonth", ""))
    if not _MONTH_RE.fullmatch(start) or not _MONTH_RE.fullmatch(end):
        raise ValueError(f"evaluation.splits.{name} must use YYYY-MM month boundaries")
    if start > end:
        raise ValueError(f"evaluation.splits.{name} startMonth must be <= endMonth")
    return MonthRange(start, end)


def _validate_split_order(calibration: MonthRange, validation: MonthRange, holdout: MonthRange) -> None:
    if calibration.end_month >= validation.start_month:
        raise ValueError("calibration and validation splits must not overlap")
    if validation.end_month >= holdout.start_month:
        raise ValueError("validation and holdout splits must not overlap")


def _parse_amount(value: object) -> Decimal:
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("transaction amount must be a decimal-compatible value") from exc
    if amount <= 0:
        raise ValueError("transaction amount must be positive")
    return amount


def _canonical_key(value: str) -> str:
    cleaned = " ".join(value.split())
    if not cleaned:
        return ""
    identity = build_merchant_identity_map([cleaned])[cleaned]
    return identity.canonical or identity.normalized


def _fingerprint(paths: Sequence[Path]) -> str:
    digest = sha256()
    for path in sorted(paths, key=lambda item: item.name):
        digest.update(path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def load_private_dataset(root: Path) -> PrivateDataset:
    manifest_path = root / "manifest.json"
    transactions_path = root / "transactions.jsonl"
    category_labels_path = root / "category_labels.jsonl"
    anomaly_labels_path = root / "anomaly_labels.jsonl"
    recurring_labels_path = root / "recurring_labels.jsonl"

    manifest = _load_json(manifest_path)
    contract_version = str(manifest.get("contractVersion", ""))
    if contract_version != DATASET_CONTRACT_VERSION:
        raise ValueError(
            f"private dataset contractVersion must be {DATASET_CONTRACT_VERSION}"
        )
    dataset_version = str(manifest.get("datasetVersion", "")).strip()
    if not dataset_version:
        raise ValueError("manifest datasetVersion is required")

    evaluation = manifest.get("evaluation")
    if not isinstance(evaluation, dict):
        raise ValueError("manifest evaluation object is required")
    splits = evaluation.get("splits")
    if not isinstance(splits, dict):
        raise ValueError("manifest evaluation.splits object is required")
    calibration = _parse_month_range(splits.get("calibration"), "calibration")
    validation = _parse_month_range(splits.get("validation"), "validation")
    holdout = _parse_month_range(splits.get("holdout"), "holdout")
    _validate_split_order(calibration, validation, holdout)

    coverage = manifest.get("labelCoverage")
    if not isinstance(coverage, dict):
        raise ValueError("manifest labelCoverage object is required")
    if coverage.get("categories") != "complete":
        raise ValueError("category labels must declare complete coverage")
    if coverage.get("anomalies") != "complete":
        raise ValueError("anomaly labels must declare complete coverage")

    transaction_rows = _load_jsonl(transactions_path)
    category_rows = _load_jsonl(category_labels_path)
    anomaly_rows = _load_jsonl(anomaly_labels_path)
    recurring_rows = _load_jsonl(recurring_labels_path, required=False)

    transaction_ids: set[str] = set()
    raw_transactions: list[tuple[str, str, Decimal, date, str]] = []
    for row in transaction_rows:
        transaction_id = str(row.get("id", "")).strip()
        merchant = str(row.get("merchant", "")).strip()
        transaction_type = str(row.get("transactionType", "")).strip()
        if not transaction_id or transaction_id in transaction_ids:
            raise ValueError("transactions.jsonl requires unique non-empty id values")
        if not merchant:
            raise ValueError("transactions.jsonl merchant must not be empty")
        if transaction_type not in _ALLOWED_TYPES:
            raise ValueError("transactionType must be expense or income")
        try:
            transaction_date = date.fromisoformat(str(row.get("date", "")))
        except ValueError as exc:
            raise ValueError("transaction date must use YYYY-MM-DD") from exc
        raw_transactions.append(
            (
                transaction_id,
                merchant,
                _parse_amount(row.get("amount")),
                transaction_date,
                transaction_type,
            )
        )
        transaction_ids.add(transaction_id)

    categories: dict[str, str] = {}
    for row in category_rows:
        transaction_id = str(row.get("transactionId", "")).strip()
        category = str(row.get("category", "")).strip()
        if not transaction_id or transaction_id in categories or not category:
            raise ValueError("category_labels.jsonl requires unique transactionId/category rows")
        categories[transaction_id] = category
    if set(categories) != transaction_ids:
        raise ValueError("category labels must match the transaction ID set exactly")

    anomaly_labels: dict[str, dict[str, bool]] = {}
    expense_ids = {item[0] for item in raw_transactions if item[4] == "expense"}
    for row in anomaly_rows:
        transaction_id = str(row.get("transactionId", "")).strip()
        if not transaction_id or transaction_id in anomaly_labels:
            raise ValueError("anomaly_labels.jsonl requires unique transactionId rows")
        anomaly_labels[transaction_id] = {
            "spendingAnomaly": bool(row.get("spendingAnomaly", False)),
            "frequencyAnomaly": bool(row.get("frequencyAnomaly", False)),
        }
    if set(anomaly_labels) != expense_ids:
        raise ValueError("anomaly labels must match the expense transaction ID set exactly")

    transactions = tuple(
        sorted(
            (
                PrivateTransaction(
                    transaction_id=transaction_id,
                    merchant=merchant,
                    amount=amount,
                    transaction_date=transaction_date,
                    transaction_type=transaction_type,
                    category=categories[transaction_id],
                )
                for transaction_id, merchant, amount, transaction_date, transaction_type in raw_transactions
            ),
            key=lambda item: (item.transaction_date, item.transaction_id),
        )
    )

    occurrence_months_raw = evaluation.get("occurrenceEvaluationMonths", [])
    if occurrence_months_raw is None:
        occurrence_months_raw = []
    if not isinstance(occurrence_months_raw, list):
        raise ValueError("evaluation.occurrenceEvaluationMonths must be an array")
    occurrence_months = tuple(str(value) for value in occurrence_months_raw)
    if any(not _MONTH_RE.fullmatch(value) for value in occurrence_months):
        raise ValueError("occurrenceEvaluationMonths entries must use YYYY-MM")

    threshold_raw = evaluation.get(
        "recurringScoreThresholdCandidates", ["55", "60", "65", "70"]
    )
    if not isinstance(threshold_raw, list) or not threshold_raw:
        raise ValueError("recurringScoreThresholdCandidates must be a non-empty array")
    thresholds = tuple(str(value) for value in threshold_raw)

    fingerprint_paths = [
        manifest_path,
        transactions_path,
        category_labels_path,
        anomaly_labels_path,
    ]
    if recurring_labels_path.exists():
        fingerprint_paths.append(recurring_labels_path)

    return PrivateDataset(
        root=root,
        dataset_version=dataset_version,
        calibration=calibration,
        validation=validation,
        holdout=holdout,
        occurrence_evaluation_months=occurrence_months,
        recurring_threshold_candidates=thresholds,
        transactions=transactions,
        anomaly_labels=anomaly_labels,
        recurring_labels=tuple(recurring_rows),
        fingerprint=_fingerprint(fingerprint_paths),
    )


def _transactions_in_range(
    transactions: Iterable[PrivateTransaction], split: MonthRange
) -> list[PrivateTransaction]:
    return [item for item in transactions if split.contains(item.transaction_date)]


def _eligible_category_examples(
    transactions: Iterable[PrivateTransaction],
) -> tuple[list[PrivateTransaction], int, dict[str, int]]:
    classes = set(get_runtime_classifier().classes_)
    eligible: list[PrivateTransaction] = []
    unsupported: dict[str, int] = {}
    for item in transactions:
        if item.category in classes:
            eligible.append(item)
        else:
            unsupported[item.category] = unsupported.get(item.category, 0) + 1
    return eligible, sum(unsupported.values()), dict(sorted(unsupported.items()))


def _classification_metrics(
    actual: Sequence[str], predicted: Sequence[str]
) -> dict[str, float | int | None]:
    if not actual:
        return {
            "support": 0,
            "accuracy": None,
            "macroF1": None,
            "weightedF1": None,
        }
    return {
        "support": len(actual),
        "accuracy": round(float(accuracy_score(actual, predicted)), 6),
        "macroF1": round(
            float(f1_score(actual, predicted, average="macro", zero_division=0)), 6
        ),
        "weightedF1": round(
            float(f1_score(actual, predicted, average="weighted", zero_division=0)), 6
        ),
    }


def _runtime_seen_keys() -> set[str]:
    return {_canonical_key(merchant) for merchant, _ in runtime_training_examples()}


def _category_slice(
    examples: Sequence[PrivateTransaction],
    probability_rows: Sequence[dict[str, float]],
) -> dict[str, Any]:
    actual = [item.category for item in examples]
    predicted = [
        max(row.items(), key=lambda entry: (entry[1], entry[0]))[0]
        for row in probability_rows
    ]
    seen_keys = _runtime_seen_keys()
    seen_actual: list[str] = []
    seen_predicted: list[str] = []
    unseen_actual: list[str] = []
    unseen_predicted: list[str] = []
    for item, prediction in zip(examples, predicted, strict=True):
        if _canonical_key(item.merchant) in seen_keys:
            seen_actual.append(item.category)
            seen_predicted.append(prediction)
        else:
            unseen_actual.append(item.category)
            unseen_predicted.append(prediction)
    return {
        "overall": _classification_metrics(actual, predicted),
        "merchantCoverage": {
            "seen": _classification_metrics(seen_actual, seen_predicted),
            "unseen": _classification_metrics(unseen_actual, unseen_predicted),
        },
    }


def _probability_rows(examples: Sequence[PrivateTransaction]) -> list[dict[str, float]]:
    classifier = get_runtime_classifier()
    return [
        prediction.probabilities
        for prediction in classifier.predict_with_probabilities(
            item.merchant for item in examples
        )
    ]


def _category_development_report(dataset: PrivateDataset) -> dict[str, Any]:
    calibration_all = _transactions_in_range(dataset.transactions, dataset.calibration)
    validation_all = _transactions_in_range(dataset.transactions, dataset.validation)
    calibration, calibration_unsupported, calibration_labels = _eligible_category_examples(
        calibration_all
    )
    validation, validation_unsupported, validation_labels = _eligible_category_examples(
        validation_all
    )
    classifier = get_runtime_classifier()
    classes = classifier.classes_
    calibration_rows = _probability_rows(calibration)
    validation_rows = _probability_rows(validation)
    calibration_actual = [item.category for item in calibration]
    validation_actual = [item.category for item in validation]
    platt_rows = platt_calibrate(
        calibration_rows, calibration_actual, validation_rows, classes
    )
    isotonic_rows = isotonic_calibrate(
        calibration_rows, calibration_actual, validation_rows, classes
    )
    return {
        "modelVersion": MODEL_VERSION,
        "featurePolicy": FEATURE_POLICY,
        "taxonomy": list(classes),
        "validation": _category_slice(validation, validation_rows),
        "calibrationDiagnostics": {
            "protocol": "private_calibration_to_private_validation_v1",
            "calibrationSupport": len(calibration),
            "validationSupport": len(validation),
            "methods": {
                "raw": calibration_metrics(validation_rows, validation_actual, classes),
                "platt": calibration_metrics(platt_rows, validation_actual, classes),
                "isotonic": calibration_metrics(
                    isotonic_rows, validation_actual, classes
                ),
            },
            "productConfidenceEnabled": False,
        },
        "outOfTaxonomy": {
            "calibrationSupport": calibration_unsupported,
            "validationSupport": validation_unsupported,
            "calibrationByLabel": calibration_labels,
            "validationByLabel": validation_labels,
        },
        "holdout": {
            "status": "sealed",
            "range": dataset.holdout.as_dict(),
            "rowCount": len(_transactions_in_range(dataset.transactions, dataset.holdout)),
        },
    }


def _category_holdout_report(
    dataset: PrivateDataset, calibration_method: str
) -> dict[str, Any]:
    calibration_all = _transactions_in_range(dataset.transactions, dataset.calibration)
    holdout_all = _transactions_in_range(dataset.transactions, dataset.holdout)
    calibration, _, _ = _eligible_category_examples(calibration_all)
    holdout, holdout_unsupported, holdout_labels = _eligible_category_examples(holdout_all)
    classifier = get_runtime_classifier()
    classes = classifier.classes_
    calibration_rows = _probability_rows(calibration)
    holdout_rows = _probability_rows(holdout)
    calibration_actual = [item.category for item in calibration]
    holdout_actual = [item.category for item in holdout]

    if calibration_method == "raw":
        selected_rows = holdout_rows
    elif calibration_method == "platt":
        selected_rows = platt_calibrate(
            calibration_rows, calibration_actual, holdout_rows, classes
        )
    elif calibration_method == "isotonic":
        selected_rows = isotonic_calibrate(
            calibration_rows, calibration_actual, holdout_rows, classes
        )
    else:
        raise ValueError("calibration_method must be raw, platt or isotonic")

    return {
        "modelVersion": MODEL_VERSION,
        "featurePolicy": FEATURE_POLICY,
        "taxonomy": list(classes),
        "holdout": _category_slice(holdout, holdout_rows),
        "calibrationDiagnostics": {
            "protocol": "frozen_method_private_holdout_v1",
            "selectedMethod": calibration_method,
            "calibrationSupport": len(calibration),
            "holdoutSupport": len(holdout),
            "metrics": calibration_metrics(selected_rows, holdout_actual, classes),
            "productConfidenceEnabled": False,
        },
        "outOfTaxonomy": {
            "holdoutSupport": holdout_unsupported,
            "holdoutByLabel": holdout_labels,
        },
    }


def _binary_metrics(actual: Sequence[bool], predicted: Sequence[bool]) -> dict[str, float | int]:
    if len(actual) != len(predicted):
        raise ValueError("binary metric arrays must have the same length")
    support = len(actual)
    tp = sum(a and p for a, p in zip(actual, predicted, strict=True))
    fp = sum((not a) and p for a, p in zip(actual, predicted, strict=True))
    fn = sum(a and (not p) for a, p in zip(actual, predicted, strict=True))
    tn = support - tp - fp - fn
    precision = precision_score(actual, predicted, zero_division=0) if support else 0.0
    recall = recall_score(actual, predicted, zero_division=0) if support else 0.0
    f1 = f1_score(actual, predicted, zero_division=0) if support else 0.0
    return {
        "support": support,
        "positives": sum(actual),
        "truePositives": tp,
        "falsePositives": fp,
        "falseNegatives": fn,
        "trueNegatives": tn,
        "precision": round(float(precision), 6),
        "recall": round(float(recall), 6),
        "f1": round(float(f1), 6),
        "falsePositivesPer100Transactions": round(
            (fp / support * 100.0) if support else 0.0, 4
        ),
    }


def _rules_report(dataset: PrivateDataset, split: MonthRange) -> dict[str, Any]:
    through_end = [
        item
        for item in dataset.transactions
        if item.transaction_type == "expense" and item.month <= split.end_month
    ]
    scored = [item for item in through_end if split.contains(item.transaction_date)]
    year, month = (int(value) for value in split.end_month.split("-"))
    analysis_date = date(year, month, monthrange(year, month)[1])
    findings = run_financial_intelligence_rules_v2(
        [item.snapshot() for item in through_end],
        analysis_date=analysis_date,
    )

    amount_ids: set[str] = set()
    frequency_ids: set[str] = set()
    finding_counts: dict[str, int] = {}
    for finding in findings:
        finding_counts[finding.finding_type] = finding_counts.get(finding.finding_type, 0) + 1
        if finding.finding_type == "spending_anomaly":
            transaction_id = finding.evidence.get("transactionId")
            if transaction_id is not None:
                amount_ids.add(str(transaction_id))
        elif finding.finding_type == "frequency_anomaly":
            raw_ids = finding.evidence.get("transactionIds", [])
            if isinstance(raw_ids, list):
                frequency_ids.update(str(value) for value in raw_ids)

    return {
        "ruleVersion": "rules-v2",
        "evaluationRange": split.as_dict(),
        "spendingAnomaly": _binary_metrics(
            [
                dataset.anomaly_labels[item.transaction_id]["spendingAnomaly"]
                for item in scored
            ],
            [item.transaction_id in amount_ids for item in scored],
        ),
        "frequencyAnomaly": _binary_metrics(
            [
                dataset.anomaly_labels[item.transaction_id]["frequencyAnomaly"]
                for item in scored
            ],
            [item.transaction_id in frequency_ids for item in scored],
        ),
        "allFindingCounts": dict(sorted(finding_counts.items())),
        "note": (
            "rules-v2 anomaly metrics are transaction-level; recurring/missing/duplicate "
            "finding counts are reported but require recurring-stream ground truth for scored metrics"
        ),
    }


def _historical_payload(dataset: PrivateDataset) -> dict[str, Any]:
    expense_transactions = [
        {
            "id": item.transaction_id,
            "merchant": item.merchant,
            "amount": format(item.amount, "f"),
            "date": item.transaction_date.isoformat(),
            "category": item.category,
        }
        for item in dataset.transactions
        if item.transaction_type == "expense"
    ]
    labels = {
        "recurringStreams": list(dataset.recurring_labels),
        "anomalyTransactionIds": sorted(
            transaction_id
            for transaction_id, values in dataset.anomaly_labels.items()
            if values["spendingAnomaly"]
        ),
    }
    return {
        "datasetVersion": dataset.dataset_version,
        "evaluation": {
            "occurrenceEvaluationMonths": list(dataset.occurrence_evaluation_months),
            "recurringScoreThresholdCandidates": list(
                dataset.recurring_threshold_candidates
            ),
            "splits": {
                "calibration": dataset.calibration.as_dict(),
                "validation": dataset.validation.as_dict(),
                "holdout": dataset.holdout.as_dict(),
            },
        },
        "labels": labels,
        "transactions": expense_transactions,
    }


def _sanitize_historical_split(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "analysisVersion": report.get("analysisVersion"),
        "split": report.get("split"),
        "splitRange": report.get("splitRange"),
        "aggregate": report.get("aggregate", {}),
        "confidenceMethod": report.get("confidenceMethod"),
    }


def _historical_development_report(dataset: PrivateDataset) -> dict[str, Any]:
    report = run_development_evaluation(
        _historical_payload(dataset),
        bootstrap=BootstrapConfig(),
    )
    return {
        "analysisVersion": report["analysisVersion"],
        "mode": report["mode"],
        "calibration": _sanitize_historical_split(report["calibration"]),
        "validation": _sanitize_historical_split(report["validation"]),
        "holdout": report["holdout"],
        "frozenParameters": report["frozenParameters"],
        "privacy": {
            "merchantSlicesOmitted": True,
            "rowLevelFoldsOmitted": True,
        },
    }


def _historical_holdout_report(
    dataset: PrivateDataset, parameters: EvaluationParameters
) -> dict[str, Any]:
    report = run_holdout_evaluation(
        _historical_payload(dataset),
        parameters,
        bootstrap=BootstrapConfig(),
    )
    return {
        "analysisVersion": report["analysisVersion"],
        "mode": report["mode"],
        "holdout": _sanitize_historical_split(report["holdout"]),
        "frozenParameters": report["frozenParameters"],
        "privacy": {
            "merchantSlicesOmitted": True,
            "rowLevelFoldsOmitted": True,
        },
    }


def evaluate_private_dataset(
    dataset_root: Path,
    *,
    mode: str = "development",
    calibration_method: str = "raw",
    historical_parameters: EvaluationParameters | None = None,
) -> dict[str, Any]:
    dataset = load_private_dataset(dataset_root)
    if mode not in {"development", "holdout"}:
        raise ValueError("mode must be development or holdout")

    if mode == "development":
        category_report = _category_development_report(dataset)
        rules_report = _rules_report(dataset, dataset.validation)
        historical_report = _historical_development_report(dataset)
    else:
        if historical_parameters is None:
            raise ValueError("holdout mode requires frozen historical parameters")
        category_report = _category_holdout_report(dataset, calibration_method)
        rules_report = _rules_report(dataset, dataset.holdout)
        historical_report = _historical_holdout_report(
            dataset, historical_parameters
        )

    return {
        "reportVersion": REPORT_VERSION,
        "datasetContractVersion": DATASET_CONTRACT_VERSION,
        "datasetVersion": dataset.dataset_version,
        "datasetFingerprint": dataset.fingerprint,
        "mode": mode,
        "privacy": {
            "aggregateOnly": True,
            "rawTransactionsIncluded": False,
            "rawMerchantsIncluded": False,
            "transactionIdsIncluded": False,
            "privateDataRequiredByCI": False,
        },
        "support": {
            "transactions": len(dataset.transactions),
            "expenseTransactions": sum(
                item.transaction_type == "expense" for item in dataset.transactions
            ),
            "recurringStreamLabels": len(dataset.recurring_labels),
        },
        "categoryClassifier": category_report,
        "rulesV2": rules_report,
        "historicalV2_2": historical_report,
        "limitations": [
            "The report is only as reliable as the completeness and consistency of the private labels.",
            "Private evaluation improves external validity but does not make one user's transaction distribution representative of all users.",
            "Out-of-taxonomy categories are reported separately rather than silently remapped.",
            "Product confidence and automatic category assignment remain disabled unless representative real evidence justifies them.",
        ],
    }
