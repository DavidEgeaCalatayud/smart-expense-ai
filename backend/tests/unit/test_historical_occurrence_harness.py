import json
from pathlib import Path

from app.services.historical_evaluation import evaluate_historical_dataset


def test_occurrence_harness_uses_prior_month_baseline_and_measures_errors() -> None:
    fixture = (
        Path(__file__).resolve().parents[2]
        / "evaluation"
        / "historical_occurrence_fixture.json"
    )
    payload = json.loads(fixture.read_text(encoding="utf-8"))

    report = evaluate_historical_dataset(payload)

    assert report["datasetVersion"] == "occurrence-fixture-v1"
    assert report["occurrenceValidationStrategy"] == "walk_forward_prior_month_baseline_next_occurrence"
    assert report["occurrenceMatchingStrategy"] == "hungarian_occurrence_max_weight_v1"
    assert report["occurrenceGroundTruthStrategy"] == "explicit_expected_occurrences_v1"

    assert len(report["folds"]) == 1
    july = report["folds"][0]
    assert july["evaluateMonth"] == "2026-07"
    occurrence = july["occurrences"]
    assert occurrence["evaluated"] is True
    assert occurrence["baselineThrough"] == "2026-06-30"
    assert occurrence["baselineTransactions"] == 6
    assert occurrence["dateToleranceDays"] == 7

    metrics = occurrence["metrics"]
    assert metrics["expectedOccurrences"] == 1
    assert metrics["predictedOccurrences"] == 1
    assert metrics["matchedOccurrences"] == 1
    assert metrics["missedOccurrences"] == 0
    assert metrics["extraPredictions"] == 0
    assert metrics["precision"] == 1.0
    assert metrics["recall"] == 1.0
    assert metrics["dateMaeDays"] == 3.0
    assert metrics["dateMeanSignedErrorDays"] == -3.0
    assert metrics["amountMae"] == "2.00"

    outcome = occurrence["outcomes"][0]
    assert outcome["status"] == "matched"
    assert outcome["expectedDate"] == "2026-07-08"
    assert outcome["predictedDate"] == "2026-07-05"
    assert outcome["expectedAmount"] == "12.00"
    assert outcome["predictedAmount"] == "10.00"
    assert outcome["amountAbsoluteError"] == "2.00"

    aggregate = report["aggregate"]["occurrences"]
    assert aggregate["matchedOccurrences"] == 1
    assert aggregate["dateMaeDays"] == 3.0
    assert aggregate["amountMae"] == "2.00"


def test_unlabelled_months_do_not_turn_predictions_into_false_positives() -> None:
    payload = {
        "datasetVersion": "unlabelled-occurrence-month-v1",
        "evaluation": {"minimumHistoryMonths": 3},
        "labels": {
            "recurringStreams": [
                {
                    "id": "service",
                    "merchant": "service",
                    "cadence": "monthly",
                    "amountMin": "9.00",
                    "amountMax": "11.00",
                    "activeFrom": "2026-01",
                    "activeUntil": "2026-04"
                }
            ],
            "anomalyTransactionIds": []
        },
        "transactions": [
            {"id":"jan","merchant":"Service","amount":"10.00","date":"2026-01-05","category":"Subscriptions"},
            {"id":"feb","merchant":"Service","amount":"10.00","date":"2026-02-05","category":"Subscriptions"},
            {"id":"mar","merchant":"Service","amount":"10.00","date":"2026-03-05","category":"Subscriptions"},
            {"id":"apr","merchant":"Service","amount":"10.00","date":"2026-04-05","category":"Subscriptions"}
        ]
    }

    report = evaluate_historical_dataset(payload)
    april = report["folds"][0]

    assert april["occurrences"]["evaluated"] is False
    assert april["occurrences"]["metrics"]["extraPredictions"] == 0
    assert report["aggregate"]["occurrences"]["predictedOccurrences"] == 0
