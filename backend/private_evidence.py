from __future__ import annotations

from calendar import monthrange
from copy import deepcopy
from datetime import date
from hashlib import sha256
import json
from pathlib import Path
from typing import Any, Sequence

from app.services.historical_evaluation_protocol import EvaluationParameters
from app.services.intelligence_rules_v2 import run_financial_intelligence_rules_v2
from ml.category_runtime import FEATURE_POLICY, MODEL_VERSION
from private_evaluation import MonthRange, PrivateDataset, evaluate_private_dataset, load_private_dataset


EVIDENCE_CONTRACT_VERSION = "private-real-data-evidence-v1"
_ALLOWED_SOURCE_TYPES = {"real_private", "synthetic_test", "other", "unspecified"}
_ALLOWED_LABEL_INDEPENDENCE = {"independent", "self_labelled", "mixed", "unknown"}


def _load_manifest(root: Path) -> dict[str, Any]:
    payload = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("manifest.json must contain one JSON object")
    return payload


def _evidence_provenance(root: Path) -> dict[str, str]:
    manifest = _load_manifest(root)
    raw = manifest.get("evidenceProvenance", {})
    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        raise ValueError("manifest evidenceProvenance must be an object")

    source_type = str(raw.get("sourceType", "unspecified")).strip() or "unspecified"
    label_independence = (
        str(raw.get("labelIndependence", "unknown")).strip() or "unknown"
    )
    if source_type not in _ALLOWED_SOURCE_TYPES:
        raise ValueError(
            "evidenceProvenance.sourceType must be real_private, synthetic_test, other or unspecified"
        )
    if label_independence not in _ALLOWED_LABEL_INDEPENDENCE:
        raise ValueError(
            "evidenceProvenance.labelIndependence must be independent, self_labelled, mixed or unknown"
        )
    return {
        "sourceType": source_type,
        "labelIndependence": label_independence,
    }


def _load_jsonl_if_present(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        if not line.strip():
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path.name}:{line_number} is not valid JSON") from exc
        if not isinstance(payload, dict):
            raise ValueError(f"{path.name}:{line_number} must contain one JSON object")
        rows.append(payload)
    return rows


def _load_category_feedback(dataset: PrivateDataset) -> dict[str, dict[str, str]]:
    path = dataset.root / "category_feedback.jsonl"
    rows = _load_jsonl_if_present(path)
    transaction_ids = {item.transaction_id for item in dataset.transactions}
    feedback: dict[str, dict[str, str]] = {}

    for row in rows:
        transaction_id = str(row.get("transactionId", "")).strip()
        suggested = str(row.get("suggestedCategory", "")).strip()
        selected = str(row.get("selectedCategory", "")).strip()
        model_version = str(row.get("modelVersion", "")).strip()
        feature_policy = str(row.get("featurePolicy", "")).strip()

        if not transaction_id or transaction_id in feedback:
            raise ValueError(
                "category_feedback.jsonl requires unique non-empty transactionId values"
            )
        if transaction_id not in transaction_ids:
            raise ValueError(
                "category_feedback.jsonl transactionId must reference a private transaction"
            )
        if not suggested or not selected:
            raise ValueError(
                "category_feedback.jsonl requires suggestedCategory and selectedCategory"
            )
        if not model_version or not feature_policy:
            raise ValueError(
                "category_feedback.jsonl requires modelVersion and featurePolicy provenance"
            )

        feedback[transaction_id] = {
            "suggestedCategory": suggested,
            "selectedCategory": selected,
            "modelVersion": model_version,
            "featurePolicy": feature_policy,
        }

    return feedback


def _rate(numerator: int, denominator: int) -> float | None:
    if denominator == 0:
        return None
    return round(numerator / denominator, 6)


def _feedback_metrics(
    dataset: PrivateDataset,
    split: MonthRange,
) -> dict[str, float | int | str | None]:
    feedback = _load_category_feedback(dataset)
    labels = {item.transaction_id: item.category for item in dataset.transactions}
    split_ids = {
        item.transaction_id
        for item in dataset.transactions
        if split.contains(item.transaction_date)
    }
    split_rows = [
        (transaction_id, row)
        for transaction_id, row in feedback.items()
        if transaction_id in split_ids
    ]
    incompatible_model_rows = sum(
        row["modelVersion"] != MODEL_VERSION or row["featurePolicy"] != FEATURE_POLICY
        for _, row in split_rows
    )
    eligible = [
        (transaction_id, row)
        for transaction_id, row in split_rows
        if row["modelVersion"] == MODEL_VERSION
        and row["featurePolicy"] == FEATURE_POLICY
    ]
    accepted = sum(
        row["suggestedCategory"] == row["selectedCategory"] for _, row in eligible
    )
    corrected = len(eligible) - accepted
    label_agreements = sum(
        row["selectedCategory"] == labels[transaction_id]
        for transaction_id, row in eligible
    )

    return {
        "support": len(eligible),
        "accepted": accepted,
        "corrected": corrected,
        "acceptanceRate": _rate(accepted, len(eligible)),
        "correctionRate": _rate(corrected, len(eligible)),
        "selectedCategoryIndependentLabelAgreementRate": _rate(
            label_agreements, len(eligible)
        ),
        "excludedDifferentModelOrFeaturePolicyRows": incompatible_model_rows,
        "modelVersion": MODEL_VERSION,
        "featurePolicy": FEATURE_POLICY,
        "definition": "observed_product_suggestion_decisions_not_classifier_accuracy",
    }


def _binary_metrics(
    actual: Sequence[bool], predicted: Sequence[bool]
) -> dict[str, float | int]:
    if len(actual) != len(predicted):
        raise ValueError("binary metric arrays must have the same length")
    support = len(actual)
    tp = sum(a and p for a, p in zip(actual, predicted, strict=True))
    fp = sum((not a) and p for a, p in zip(actual, predicted, strict=True))
    fn = sum(a and (not p) for a, p in zip(actual, predicted, strict=True))
    tn = support - tp - fp - fn
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "support": support,
        "positives": sum(actual),
        "truePositives": tp,
        "falsePositives": fp,
        "falseNegatives": fn,
        "trueNegatives": tn,
        "precision": round(precision, 6),
        "recall": round(recall, 6),
        "f1": round(f1, 6),
        "falsePositivesPer100Transactions": round(
            (fp / support * 100.0) if support else 0.0, 4
        ),
    }


def _combined_rules_anomaly_metrics(
    dataset: PrivateDataset, split: MonthRange
) -> dict[str, float | int]:
    through_end = [
        item
        for item in dataset.transactions
        if item.transaction_type == "expense" and item.month <= split.end_month
    ]
    scored = [item for item in through_end if split.contains(item.transaction_date)]
    year, month = (int(value) for value in split.end_month.split("-"))
    findings = run_financial_intelligence_rules_v2(
        [item.snapshot() for item in through_end],
        analysis_date=date(year, month, monthrange(year, month)[1]),
    )

    amount_ids: set[str] = set()
    frequency_ids: set[str] = set()
    for finding in findings:
        if finding.finding_type == "spending_anomaly":
            transaction_id = finding.evidence.get("transactionId")
            if transaction_id is not None:
                amount_ids.add(str(transaction_id))
        elif finding.finding_type == "frequency_anomaly":
            raw_ids = finding.evidence.get("transactionIds", [])
            if isinstance(raw_ids, list):
                frequency_ids.update(str(value) for value in raw_ids)

    return _binary_metrics(
        [
            bool(
                dataset.anomaly_labels[item.transaction_id]["spendingAnomaly"]
                or dataset.anomaly_labels[item.transaction_id]["frequencyAnomaly"]
            )
            for item in scored
        ],
        [
            item.transaction_id in amount_ids or item.transaction_id in frequency_ids
            for item in scored
        ],
    )


def _compact_calibration(category_report: dict[str, Any], mode: str) -> dict[str, Any]:
    diagnostics = category_report.get("calibrationDiagnostics", {})
    if mode == "development":
        methods = diagnostics.get("methods", {})
        return {
            "protocol": diagnostics.get("protocol"),
            "calibrationSupport": diagnostics.get("calibrationSupport", 0),
            "evaluationSupport": diagnostics.get("validationSupport", 0),
            "methods": {
                name: {
                    "brierScore": metrics.get("brierScore"),
                    "expectedCalibrationError": metrics.get(
                        "expectedCalibrationError"
                    ),
                }
                for name, metrics in methods.items()
                if isinstance(metrics, dict)
            },
            "productConfidenceEnabled": False,
        }

    metrics = diagnostics.get("metrics", {})
    return {
        "protocol": diagnostics.get("protocol"),
        "selectedMethod": diagnostics.get("selectedMethod"),
        "calibrationSupport": diagnostics.get("calibrationSupport", 0),
        "evaluationSupport": diagnostics.get("holdoutSupport", 0),
        "brierScore": metrics.get("brierScore") if isinstance(metrics, dict) else None,
        "expectedCalibrationError": (
            metrics.get("expectedCalibrationError")
            if isinstance(metrics, dict)
            else None
        ),
        "productConfidenceEnabled": False,
    }


def _evidence_fingerprint(dataset_fingerprint: str, root: Path) -> str:
    digest = sha256()
    digest.update(dataset_fingerprint.encode("ascii"))
    feedback_path = root / "category_feedback.jsonl"
    if feedback_path.exists():
        digest.update(b"\0category_feedback.jsonl\0")
        digest.update(feedback_path.read_bytes())
    return digest.hexdigest()


def _target_split(dataset: PrivateDataset, mode: str) -> tuple[str, MonthRange]:
    if mode == "development":
        return "validation", dataset.validation
    if mode == "holdout":
        return "holdout", dataset.holdout
    raise ValueError("mode must be development or holdout")


def _build_evidence_summary(
    report: dict[str, Any],
    dataset: PrivateDataset,
    feedback: dict[str, Any],
    combined_anomalies: dict[str, Any],
) -> dict[str, Any]:
    split_name, _ = _target_split(dataset, str(report["mode"]))
    category_report = report["categoryClassifier"]
    category_slice = category_report[split_name]
    unseen = category_slice["merchantCoverage"]["unseen"]
    historical_split = report["historicalV2_2"][split_name]
    historical_aggregate = historical_split.get("aggregate", {})
    occurrences = historical_aggregate.get("occurrences", {})

    return {
        "evaluationSplit": split_name,
        "classification": {
            "support": category_slice["overall"]["support"],
            "accuracy": category_slice["overall"]["accuracy"],
            "macroF1": category_slice["overall"]["macroF1"],
            "unseenMerchantSupport": unseen["support"],
            "unseenMerchantF1": unseen["macroF1"],
            "unseenMerchantF1Definition": "macro_f1_on_natural_unseen_merchant_examples",
            "calibration": _compact_calibration(category_report, str(report["mode"])),
            "feedbackSupport": feedback["support"],
            "acceptanceRate": feedback["acceptanceRate"],
            "correctionRate": feedback["correctionRate"],
            "observedSuggestionFeedback": feedback,
        },
        "anomalies": {
            "definition": "spendingAnomaly_or_frequencyAnomaly_on_identical_transaction_support",
            **combined_anomalies,
        },
        "recurrences": {
            "expectedOccurrences": occurrences.get("expectedOccurrences", 0),
            "predictedOccurrences": occurrences.get("predictedOccurrences", 0),
            "matchedOccurrences": occurrences.get("matchedOccurrences", 0),
            "occurrencePrecision": occurrences.get("precision"),
            "occurrenceRecall": occurrences.get("recall"),
            "occurrenceF1": occurrences.get("f1"),
            "dateMaeDays": occurrences.get("dateMaeDays"),
            "amountEvaluatedOccurrences": occurrences.get(
                "amountEvaluatedOccurrences", 0
            ),
            "amountMae": occurrences.get("amountMae"),
        },
    }


def _build_readiness(
    report: dict[str, Any], provenance: dict[str, str]
) -> dict[str, Any]:
    summary = report["evidenceSummary"]
    classification = summary["classification"]
    feedback = classification["observedSuggestionFeedback"]
    anomalies = summary["anomalies"]
    recurrences = summary["recurrences"]
    calibration = classification["calibration"]

    checks = {
        "realPrivateSource": provenance["sourceType"] == "real_private",
        "independentLabels": provenance["labelIndependence"] == "independent",
        "classificationSupport": int(classification["support"] or 0) > 0,
        "unseenMerchantSupport": int(classification["unseenMerchantSupport"] or 0) > 0,
        "calibrationSupport": int(calibration.get("calibrationSupport", 0) or 0) > 0
        and int(calibration.get("evaluationSupport", 0) or 0) > 0,
        "observedSuggestionFeedbackSupport": int(feedback["support"] or 0) > 0,
        "anomalySupport": int(anomalies["support"] or 0) > 0,
        "occurrenceSupport": int(recurrences["expectedOccurrences"] or 0) > 0,
        "occurrenceAmountSupport": int(
            recurrences["amountEvaluatedOccurrences"] or 0
        )
        > 0,
    }
    missing = [name for name, value in checks.items() if not value]
    ready = not missing
    return {
        "readyForRealEvidenceClaim": ready,
        "readyForFinalHoldoutClaim": ready and report["mode"] == "holdout",
        "checks": checks,
        "missing": missing,
        "note": (
            "Readiness verifies provenance and metric availability, not population "
            "representativeness or statistical power; support counts must still be reported."
        ),
    }


def augment_private_evidence_report(
    dataset_root: Path, report: dict[str, Any]
) -> dict[str, Any]:
    enriched = deepcopy(report)
    dataset = load_private_dataset(dataset_root)
    provenance = _evidence_provenance(dataset_root)
    split_name, split = _target_split(dataset, str(enriched["mode"]))
    feedback = _feedback_metrics(dataset, split)
    combined_anomalies = _combined_rules_anomaly_metrics(dataset, split)

    enriched["evidenceContractVersion"] = EVIDENCE_CONTRACT_VERSION
    enriched["evidenceProvenance"] = {
        **provenance,
        "categoryFeedbackOrigin": (
            "observed_product_decisions"
            if (dataset_root / "category_feedback.jsonl").exists()
            else "not_provided"
        ),
    }
    enriched["evidenceFingerprint"] = _evidence_fingerprint(
        str(enriched["datasetFingerprint"]), dataset_root
    )
    enriched["categoryClassifier"]["observedSuggestionFeedback"] = {
        "evaluationSplit": split_name,
        **feedback,
    }
    enriched["rulesV2"]["anyAnomaly"] = combined_anomalies
    enriched["evidenceSummary"] = _build_evidence_summary(
        enriched, dataset, feedback, combined_anomalies
    )
    enriched["evidenceReadiness"] = _build_readiness(enriched, provenance)
    enriched["limitations"] = list(enriched.get("limitations", [])) + [
        "Acceptance/correction rates describe observed suggestion decisions and are not inferred from classifier correctness.",
        "Evidence-readiness checks metric availability and provenance, not whether support is large enough to generalize to a population.",
    ]
    return enriched


def evaluate_private_evidence(
    dataset_root: Path,
    *,
    mode: str = "development",
    calibration_method: str = "raw",
    historical_parameters: EvaluationParameters | None = None,
) -> dict[str, Any]:
    report = evaluate_private_dataset(
        dataset_root,
        mode=mode,
        calibration_method=calibration_method,
        historical_parameters=historical_parameters,
    )
    return augment_private_evidence_report(dataset_root, report)


def build_public_evidence_summary(report: dict[str, Any]) -> dict[str, Any]:
    required = (
        "evidenceContractVersion",
        "datasetContractVersion",
        "datasetVersion",
        "datasetFingerprint",
        "evidenceFingerprint",
        "mode",
        "evidenceProvenance",
        "support",
        "evidenceSummary",
        "evidenceReadiness",
        "limitations",
    )
    missing = [key for key in required if key not in report]
    if missing:
        raise ValueError(
            "report is missing private evidence fields: " + ", ".join(missing)
        )
    return {key: deepcopy(report[key]) for key in required}


def require_real_evidence(report: dict[str, Any], *, final_holdout: bool = False) -> None:
    readiness = report.get("evidenceReadiness", {})
    key = "readyForFinalHoldoutClaim" if final_holdout else "readyForRealEvidenceClaim"
    if readiness.get(key) is True:
        return
    missing = readiness.get("missing", [])
    suffix = ", ".join(str(value) for value in missing) or "unknown requirements"
    if final_holdout and report.get("mode") != "holdout":
        suffix = f"holdoutMode, {suffix}"
    raise ValueError(f"private real-data evidence requirements not met: {suffix}")
