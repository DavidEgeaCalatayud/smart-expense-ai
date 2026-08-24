import json
from pathlib import Path

import app.services.historical_evaluation as historical_evaluation
from app.services.historical_evaluation import evaluate_historical_dataset


def test_walk_forward_evaluation_reports_required_metrics_and_slices() -> None:
    fixture = Path(__file__).resolve().parents[2] / "evaluation" / "historical_v2_fixture.json"
    payload = json.loads(fixture.read_text(encoding="utf-8"))

    report = evaluate_historical_dataset(payload)

    assert report["datasetVersion"] == "fixture-v2"
    assert report["analysisVersion"] == "historical-v2.1"
    assert report["validationStrategy"] == "walk_forward_monthly_fold_local_identity"
    assert report["labelStrategy"] == "temporal_recurring_streams"
    assert [fold["evaluateMonth"] for fold in report["folds"]] == [
        "2026-07",
        "2026-08",
        "2026-09",
        "2026-10",
    ]

    for metric_group in (report["aggregate"]["recurrence"], report["aggregate"]["anomalies"]):
        assert "precision" in metric_group
        assert "recall" in metric_group
        assert "f1" in metric_group
        assert "falsePositivesPer100Transactions" in metric_group
        assert "falseNegatives" in metric_group

    assert set(report["recurrenceByHistoryLength"]) == {"0-3", "4-7", "8+"}
    assert "stream box" in report["recurrenceByMerchant"]
    assert "Subscriptions" in report["anomalyByCategory"]
    assert report["aggregate"]["anomalies"]["truePositives"] >= 1


def test_identity_map_is_rebuilt_from_each_fold_without_future_merchants(monkeypatch) -> None:
    payload = {
        "datasetVersion": "leakage-regression-v1",
        "evaluation": {"minimumHistoryMonths": 3},
        "labels": {"recurringStreams": [], "anomalyTransactionIds": []},
        "transactions": [
            {"id": "jan", "merchant": "STREAM BOX 1001", "amount": "10.00", "date": "2026-01-31", "category": "Subscriptions"},
            {"id": "feb", "merchant": "STREAM BOX 1002", "amount": "10.00", "date": "2026-02-28", "category": "Subscriptions"},
            {"id": "mar", "merchant": "STREAM BOX 1003", "amount": "10.00", "date": "2026-03-31", "category": "Subscriptions"},
            {"id": "apr", "merchant": "STREAM BOX 1004", "amount": "10.00", "date": "2026-04-30", "category": "Subscriptions"},
            {"id": "future", "merchant": "StreamBox Official", "amount": "10.00", "date": "2026-10-31", "category": "Subscriptions"}
        ],
    }

    calls: list[tuple[str, ...]] = []
    real_builder = historical_evaluation.build_merchant_identity_map

    def traced_builder(values: list[str]):
        calls.append(tuple(values))
        return real_builder(values)

    monkeypatch.setattr(historical_evaluation, "build_merchant_identity_map", traced_builder)
    report = evaluate_historical_dataset(payload)

    assert len(calls) == len(report["folds"])
    first_fold_merchants = set(calls[0])
    assert "StreamBox Official" not in first_fold_merchants
    assert "StreamBox Official" in set(calls[-1])
    assert report["folds"][0]["identitySourceTransactions"] == 4
    assert report["folds"][-1]["identitySourceTransactions"] == 5


def test_temporal_labels_measure_cancellation_and_reactivation_per_fold() -> None:
    payload = {
        "datasetVersion": "temporal-labels-v1",
        "evaluation": {"minimumHistoryMonths": 3},
        "labels": {
            "recurringStreams": [
                {
                    "id": "service-first-run",
                    "merchant": "service",
                    "cadence": "monthly",
                    "amountMin": "9.00",
                    "amountMax": "11.00",
                    "activeFrom": "2026-01",
                    "activeUntil": "2026-04"
                },
                {
                    "id": "service-reactivated",
                    "merchant": "service",
                    "cadence": "monthly",
                    "amountMin": "9.00",
                    "amountMax": "11.00",
                    "activeFrom": "2026-06",
                    "activeUntil": "2026-07"
                }
            ],
            "anomalyTransactionIds": []
        },
        "transactions": [
            {"id": "jan", "merchant": "Service", "amount": "10.00", "date": "2026-01-31", "category": "Subscriptions"},
            {"id": "feb", "merchant": "Service", "amount": "10.00", "date": "2026-02-28", "category": "Subscriptions"},
            {"id": "mar", "merchant": "Service", "amount": "10.00", "date": "2026-03-31", "category": "Subscriptions"},
            {"id": "apr", "merchant": "Service", "amount": "10.00", "date": "2026-04-30", "category": "Subscriptions"},
            {"id": "may-anchor", "merchant": "Market", "amount": "20.00", "date": "2026-05-31", "category": "Food"},
            {"id": "jun", "merchant": "Service", "amount": "10.00", "date": "2026-06-30", "category": "Subscriptions"},
            {"id": "jul", "merchant": "Service", "amount": "10.00", "date": "2026-07-31", "category": "Subscriptions"}
        ]
    }

    report = evaluate_historical_dataset(payload)
    folds = {fold["evaluateMonth"]: fold for fold in report["folds"]}

    # The first lifecycle is inactive in May. A lingering prediction is therefore measured
    # as a false positive instead of being counted as globally recurring forever.
    assert folds["2026-05"]["recurrence"]["truePositives"] == 0
    # The reactivated label only becomes relevant from June onward.
    assert folds["2026-06"]["recurrence"]["truePositives"] + folds["2026-06"]["recurrence"]["falseNegatives"] >= 1
