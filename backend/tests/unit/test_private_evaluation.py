from __future__ import annotations

from datetime import date
import json
from pathlib import Path

import pytest

from app.services.historical_evaluation_protocol import EvaluationParameters
from private_evaluation import evaluate_private_dataset, load_private_dataset


def _write_jsonl(path: Path, rows: list[dict[str, object]]) -> None:
    path.write_text(
        "".join(json.dumps(row, sort_keys=True) + "\n" for row in rows),
        encoding="utf-8",
    )


def _build_private_fixture(root: Path) -> None:
    root.mkdir(parents=True, exist_ok=True)
    manifest = {
        "contractVersion": "private-real-data-v1",
        "datasetVersion": "private-ci-fixture-v1",
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
        month_key = f"2025-{month:02d}"
        subscription_id = f"subscription-{month:02d}"
        market_id = f"market-{month:02d}"
        subscription_amount = "100.00" if month == 9 else "10.00"
        subscription_date = date(2025, month, 5).isoformat()
        market_date = date(2025, month, 15).isoformat()

        transactions.extend(
            [
                {
                    "id": subscription_id,
                    "merchant": "Spotify Private Descriptor",
                    "amount": subscription_amount,
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


def test_private_development_report_is_aggregate_only_and_seals_holdout(tmp_path: Path) -> None:
    dataset_root = tmp_path / "private"
    _build_private_fixture(dataset_root)

    report = evaluate_private_dataset(dataset_root, mode="development")

    assert report["reportVersion"] == "private-real-data-evaluation-v1"
    assert report["privacy"] == {
        "aggregateOnly": True,
        "rawTransactionsIncluded": False,
        "rawMerchantsIncluded": False,
        "transactionIdsIncluded": False,
        "privateDataRequiredByCI": False,
    }
    assert report["categoryClassifier"]["holdout"]["status"] == "sealed"
    assert report["categoryClassifier"]["calibrationDiagnostics"]["productConfidenceEnabled"] is False
    assert report["rulesV2"]["spendingAnomaly"]["support"] == 4
    assert report["historicalV2_2"]["holdout"]["status"] == "sealed"

    serialized = json.dumps(report, sort_keys=True)
    assert "Spotify Private Descriptor" not in serialized
    assert "Mercado Barrio Norte" not in serialized
    assert "subscription-09" not in serialized
    assert "market-09" not in serialized


def test_private_holdout_requires_and_uses_frozen_historical_parameters(tmp_path: Path) -> None:
    dataset_root = tmp_path / "private"
    _build_private_fixture(dataset_root)

    development = evaluate_private_dataset(dataset_root, mode="development")
    parameters = EvaluationParameters.from_frozen_dict(
        development["historicalV2_2"]["frozenParameters"]
    )
    holdout = evaluate_private_dataset(
        dataset_root,
        mode="holdout",
        calibration_method="platt",
        historical_parameters=parameters,
    )

    assert holdout["mode"] == "holdout"
    assert holdout["categoryClassifier"]["calibrationDiagnostics"]["selectedMethod"] == "platt"
    assert holdout["historicalV2_2"]["mode"] == "holdout"
    assert "aggregate" in holdout["historicalV2_2"]["holdout"]


def test_private_dataset_rejects_incomplete_anomaly_coverage(tmp_path: Path) -> None:
    dataset_root = tmp_path / "private"
    _build_private_fixture(dataset_root)
    anomaly_path = dataset_root / "anomaly_labels.jsonl"
    rows = anomaly_path.read_text(encoding="utf-8").splitlines()
    anomaly_path.write_text("\n".join(rows[:-1]) + "\n", encoding="utf-8")

    with pytest.raises(ValueError, match="anomaly labels must match"):
        load_private_dataset(dataset_root)
