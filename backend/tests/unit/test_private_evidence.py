from __future__ import annotations

from datetime import date
import json
from pathlib import Path

import pytest

from private_evidence import (
    build_public_evidence_summary,
    evaluate_private_evidence,
    require_real_evidence,
)


def _write_jsonl(path: Path, rows: list[dict[str, object]]) -> None:
    path.write_text(
        "".join(json.dumps(row, sort_keys=True) + "\n" for row in rows),
        encoding="utf-8",
    )


def _build_evidence_fixture(root: Path) -> None:
    root.mkdir(parents=True, exist_ok=True)
    manifest = {
        "contractVersion": "private-real-data-v1",
        "datasetVersion": "private-evidence-ci-fixture-v1",
        "evidenceProvenance": {
            "sourceType": "synthetic_test",
            "labelIndependence": "independent",
        },
        "labelCoverage": {"categories": "complete", "anomalies": "complete"},
        "evaluation": {
            "splits": {
                "calibration": {"startMonth": "2025-07", "endMonth": "2025-08"},
                "validation": {"startMonth": "2025-09", "endMonth": "2025-10"},
                "holdout": {"startMonth": "2025-11", "endMonth": "2025-12"},
            },
            "occurrenceEvaluationMonths": [
                "2025-07",
                "2025-08",
                "2025-09",
                "2025-10",
                "2025-11",
                "2025-12",
            ],
            "recurringScoreThresholdCandidates": ["55", "60", "65", "70"],
        },
    }
    (root / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    transactions: list[dict[str, object]] = []
    category_labels: list[dict[str, object]] = []
    anomaly_labels: list[dict[str, object]] = []
    expected_occurrences: list[dict[str, str]] = []

    for month in range(1, 13):
        subscription_id = f"subscription-{month:02d}"
        market_id = f"market-{month:02d}"
        subscription_date = date(2025, month, 5).isoformat()
        market_date = date(2025, month, 15).isoformat()
        transactions.extend(
            [
                {
                    "id": subscription_id,
                    "merchant": "Spotify Private Descriptor",
                    "amount": "100.00" if month == 9 else "10.00",
                    "date": subscription_date,
                    "transactionType": "expense",
                },
                {
                    "id": market_id,
                    "merchant": "Mercado Barrio Norte",
                    "amount": "42.00",
                    "date": market_date,
                    "transactionType": "expense",
                },
            ]
        )
        category_labels.extend(
            [
                {"transactionId": subscription_id, "category": "Subscriptions"},
                {"transactionId": market_id, "category": "Food"},
            ]
        )
        anomaly_labels.extend(
            [
                {
                    "transactionId": subscription_id,
                    "spendingAnomaly": month == 9,
                    "frequencyAnomaly": False,
                },
                {
                    "transactionId": market_id,
                    "spendingAnomaly": False,
                    "frequencyAnomaly": False,
                },
            ]
        )
        if month >= 7:
            expected_occurrences.append(
                {"date": subscription_date, "amount": "10.00"}
            )

    _write_jsonl(root / "transactions.jsonl", transactions)
    _write_jsonl(root / "category_labels.jsonl", category_labels)
    _write_jsonl(root / "anomaly_labels.jsonl", anomaly_labels)
    _write_jsonl(
        root / "recurring_labels.jsonl",
        [
            {
                "id": "private-subscription-stream",
                "merchant": "spotify private descriptor",
                "cadence": "monthly",
                "amountMin": "9.00",
                "amountMax": "12.00",
                "activeFrom": "2025-01",
                "activeUntil": "2025-12",
                "expectedOccurrences": expected_occurrences,
            }
        ],
    )
    _write_jsonl(
        root / "category_feedback.jsonl",
        [
            {
                "transactionId": "subscription-09",
                "suggestedCategory": "Subscriptions",
                "selectedCategory": "Subscriptions",
                "modelVersion": "tfidf-logreg-v1",
                "featurePolicy": "merchant_descriptor_only_v1",
            },
            {
                "transactionId": "market-09",
                "suggestedCategory": "Shopping",
                "selectedCategory": "Food",
                "modelVersion": "tfidf-logreg-v1",
                "featurePolicy": "merchant_descriptor_only_v1",
            },
            {
                "transactionId": "subscription-10",
                "suggestedCategory": "Subscriptions",
                "selectedCategory": "Subscriptions",
                "modelVersion": "tfidf-logreg-v1",
                "featurePolicy": "merchant_descriptor_only_v1",
            },
            {
                "transactionId": "market-10",
                "suggestedCategory": "Shopping",
                "selectedCategory": "Food",
                "modelVersion": "tfidf-logreg-v1",
                "featurePolicy": "merchant_descriptor_only_v1",
            },
            {
                "transactionId": "market-11",
                "suggestedCategory": "Food",
                "selectedCategory": "Food",
                "modelVersion": "tfidf-logreg-v0",
                "featurePolicy": "merchant_descriptor_only_v0",
            },
        ],
    )


def test_private_evidence_surfaces_requested_metrics_without_raw_rows(
    tmp_path: Path,
) -> None:
    dataset_root = tmp_path / "private"
    _build_evidence_fixture(dataset_root)

    report = evaluate_private_evidence(dataset_root, mode="development")
    summary = report["evidenceSummary"]
    feedback = summary["classification"]["observedSuggestionFeedback"]

    assert report["evidenceContractVersion"] == "private-real-data-evidence-v1"
    assert report["evidenceProvenance"]["sourceType"] == "synthetic_test"
    assert summary["evaluationSplit"] == "validation"
    assert summary["classification"]["support"] == 4
    assert summary["classification"]["accuracy"] is not None
    assert summary["classification"]["macroF1"] is not None
    assert "unseenMerchantF1" in summary["classification"]
    assert set(summary["classification"]["calibration"]["methods"]) == {
        "raw",
        "platt",
        "isotonic",
    }

    assert feedback["support"] == 4
    assert feedback["accepted"] == 2
    assert feedback["corrected"] == 2
    assert feedback["acceptanceRate"] == 0.5
    assert feedback["correctionRate"] == 0.5
    assert feedback["selectedCategoryIndependentLabelAgreementRate"] == 1.0
    assert feedback["definition"] == (
        "observed_product_suggestion_decisions_not_classifier_accuracy"
    )

    assert report["rulesV2"]["anyAnomaly"]["support"] == 4
    assert summary["anomalies"]["support"] == 4
    assert "precision" in summary["anomalies"]
    assert "recall" in summary["anomalies"]
    assert "f1" in summary["anomalies"]
    assert "falsePositivesPer100Transactions" in summary["anomalies"]

    recurrence = summary["recurrences"]
    assert "occurrencePrecision" in recurrence
    assert "occurrenceRecall" in recurrence
    assert "dateMaeDays" in recurrence
    assert "amountMae" in recurrence

    public_summary = build_public_evidence_summary(report)
    serialized = json.dumps(public_summary, sort_keys=True)
    assert "Spotify Private Descriptor" not in serialized
    assert "Mercado Barrio Norte" not in serialized
    assert "subscription-09" not in serialized
    assert "market-09" not in serialized
    assert '"suggestedCategory":' not in serialized
    assert '"selectedCategory":' not in serialized


def test_acceptance_is_not_derived_from_independent_label_accuracy(tmp_path: Path) -> None:
    dataset_root = tmp_path / "private"
    _build_evidence_fixture(dataset_root)

    report = evaluate_private_evidence(dataset_root, mode="development")
    classification = report["evidenceSummary"]["classification"]
    feedback = classification["observedSuggestionFeedback"]

    assert feedback["acceptanceRate"] == 0.5
    assert feedback["correctionRate"] == 0.5
    assert feedback["acceptanceRate"] != classification["accuracy"] or classification[
        "accuracy"
    ] == 0.5
    assert feedback["definition"] != "classifier_accuracy"


def test_evidence_fingerprint_changes_when_observed_feedback_changes(
    tmp_path: Path,
) -> None:
    dataset_root = tmp_path / "private"
    _build_evidence_fixture(dataset_root)
    first = evaluate_private_evidence(dataset_root, mode="development")

    feedback_path = dataset_root / "category_feedback.jsonl"
    rows = [json.loads(line) for line in feedback_path.read_text(encoding="utf-8").splitlines()]
    rows[0]["selectedCategory"] = "Shopping"
    _write_jsonl(feedback_path, rows)
    second = evaluate_private_evidence(dataset_root, mode="development")

    assert first["datasetFingerprint"] == second["datasetFingerprint"]
    assert first["evidenceFingerprint"] != second["evidenceFingerprint"]


def test_synthetic_fixture_can_never_pass_real_evidence_gate(tmp_path: Path) -> None:
    dataset_root = tmp_path / "private"
    _build_evidence_fixture(dataset_root)
    report = evaluate_private_evidence(dataset_root, mode="development")

    assert report["evidenceReadiness"]["readyForRealEvidenceClaim"] is False
    assert report["evidenceReadiness"]["checks"]["realPrivateSource"] is False
    with pytest.raises(ValueError, match="real-data evidence requirements not met"):
        require_real_evidence(report)


def test_final_holdout_gate_requires_holdout_even_for_complete_aggregate_report() -> None:
    report = {
        "mode": "development",
        "evidenceReadiness": {
            "readyForRealEvidenceClaim": True,
            "readyForFinalHoldoutClaim": False,
            "missing": [],
        },
    }

    require_real_evidence(report)
    with pytest.raises(ValueError, match="holdoutMode"):
        require_real_evidence(report, final_holdout=True)
