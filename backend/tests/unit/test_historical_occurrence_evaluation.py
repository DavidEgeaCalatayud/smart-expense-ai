from datetime import date
from decimal import Decimal
from itertools import permutations

from app.services.historical_occurrence_evaluation import (
    ExpectedOccurrence,
    PredictedOccurrence,
    build_occurrence_outcomes,
    occurrence_metrics,
    optimal_occurrence_matching,
)


def _target(label_id: str, day: int, amount: str) -> ExpectedOccurrence:
    return ExpectedOccurrence(
        label_id=label_id,
        merchant="service",
        cadence="monthly",
        amount_min=Decimal("1.00"),
        amount_max=Decimal("100.00"),
        descriptor_contains=None,
        calendar_signature=None,
        occurrence_date=date(2026, 7, day),
        expected_amount=Decimal(amount),
    )


def _prediction(stream_key: str, day: int, amount: str) -> PredictedOccurrence:
    profile = {
        "streamKey": stream_key,
        "canonicalMerchant": "service",
        "cadence": "monthly",
        "medianAmount": amount,
    }
    return PredictedOccurrence(
        profile_index=0,
        profile=profile,
        occurrence_date=date(2026, 7, day),
        predicted_amount=Decimal(amount),
    )


def test_occurrence_metrics_measure_date_and_amount_error() -> None:
    targets = [_target("monthly", 8, "12.00")]
    predictions = [_prediction("service::default", 5, "10.00")]

    matching = optimal_occurrence_matching(targets, predictions, date_tolerance_days=7)
    outcomes = build_occurrence_outcomes(targets, predictions, matching)
    metrics = occurrence_metrics(outcomes)

    assert len(matching.pairs) == 1
    assert matching.pairs[0].date_error_days == -3
    assert matching.pairs[0].amount_absolute_error == Decimal("2.00")
    assert metrics["matchedOccurrences"] == 1
    assert metrics["dateMaeDays"] == 3.0
    assert metrics["dateMeanSignedErrorDays"] == -3.0
    assert metrics["amountMae"] == "2.00"
    assert metrics["amountMape"] == 0.1667


def test_occurrence_matching_counts_missed_and_extra_predictions() -> None:
    targets = [
        _target("expected", 5, "10.00"),
        ExpectedOccurrence(
            label_id="missing",
            merchant="other service",
            cadence="monthly",
            amount_min=Decimal("10.00"),
            amount_max=Decimal("10.00"),
            descriptor_contains=None,
            calendar_signature=None,
            occurrence_date=date(2026, 7, 20),
            expected_amount=Decimal("10.00"),
        ),
    ]
    predictions = [
        _prediction("service::default", 5, "10.00"),
        PredictedOccurrence(
            profile_index=1,
            profile={
                "streamKey": "unlabelled::default",
                "canonicalMerchant": "unlabelled",
                "cadence": "monthly",
                "medianAmount": "8.00",
            },
            occurrence_date=date(2026, 7, 12),
            predicted_amount=Decimal("8.00"),
        ),
    ]

    matching = optimal_occurrence_matching(targets, predictions)
    outcomes = build_occurrence_outcomes(targets, predictions, matching)
    metrics = occurrence_metrics(outcomes)

    assert metrics["expectedOccurrences"] == 2
    assert metrics["predictedOccurrences"] == 2
    assert metrics["matchedOccurrences"] == 1
    assert metrics["missedOccurrences"] == 1
    assert metrics["extraPredictions"] == 1
    assert metrics["precision"] == 0.5
    assert metrics["recall"] == 0.5
    assert metrics["f1"] == 0.5


def test_occurrence_matching_is_permutation_invariant() -> None:
    targets = [
        _target("early", 5, "9.99"),
        _target("middle", 15, "19.99"),
        _target("late", 25, "29.99"),
    ]
    predictions = [
        _prediction("service::early", 6, "9.99"),
        _prediction("service::middle", 14, "19.99"),
        _prediction("service::late", 24, "29.99"),
    ]

    expected_semantics = None
    for target_order in permutations(targets):
        for prediction_order in permutations(predictions):
            matching = optimal_occurrence_matching(
                list(target_order),
                list(prediction_order),
                date_tolerance_days=7,
            )
            outcomes = build_occurrence_outcomes(
                list(target_order),
                list(prediction_order),
                matching,
            )
            semantics = {
                (
                    item.label_id,
                    item.stream_key,
                    item.expected_date,
                    item.predicted_date,
                )
                for item in outcomes
                if item.status == "matched"
            }
            if expected_semantics is None:
                expected_semantics = semantics
            assert semantics == expected_semantics
            metrics = occurrence_metrics(outcomes)
            assert metrics["precision"] == 1.0
            assert metrics["recall"] == 1.0


def test_prediction_outside_date_tolerance_is_not_forced_to_match() -> None:
    targets = [_target("monthly", 5, "10.00")]
    predictions = [_prediction("service::default", 20, "10.00")]

    matching = optimal_occurrence_matching(targets, predictions, date_tolerance_days=7)
    metrics = occurrence_metrics(build_occurrence_outcomes(targets, predictions, matching))

    assert matching.pairs == ()
    assert metrics["missedOccurrences"] == 1
    assert metrics["extraPredictions"] == 1
