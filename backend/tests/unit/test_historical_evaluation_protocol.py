import json
from pathlib import Path

import pytest

from app.services.evaluation_confidence import (
    BootstrapConfig,
    bootstrap_binary_fold_metrics,
)
from app.services.historical_evaluation_protocol import (
    EvaluationParameters,
    parse_evaluation_protocol,
)
from app.services.historical_evaluation_runner import (
    run_development_evaluation,
    run_holdout_evaluation,
)


def _fixture_payload() -> dict:
    fixture = Path(__file__).resolve().parents[2] / "evaluation" / "historical_v2_fixture.json"
    return json.loads(fixture.read_text(encoding="utf-8"))


def test_temporal_protocol_requires_non_overlapping_ordered_splits() -> None:
    payload = _fixture_payload()
    protocol = parse_evaluation_protocol(payload)
    assert protocol is not None
    assert protocol.calibration.end_month == "2026-07"
    assert protocol.validation.start_month == "2026-08"
    assert protocol.holdout.start_month == "2026-10"

    payload["evaluation"]["splits"]["validation"]["startMonth"] = "2026-07"
    with pytest.raises(ValueError, match="calibration must end before validation"):
        parse_evaluation_protocol(payload)


def test_frozen_parameter_fingerprint_detects_tampering() -> None:
    parameters = EvaluationParameters(
        parameter_set_id="historical-v2.2-default",
        recurring_score_threshold=55,
    )
    frozen = parameters.as_frozen_dict()
    restored = EvaluationParameters.from_frozen_dict(frozen)
    assert restored.fingerprint == parameters.fingerprint

    frozen["recurringScoreThreshold"] = "70"
    with pytest.raises(ValueError, match="fingerprint does not match"):
        EvaluationParameters.from_frozen_dict(frozen)


def test_month_block_bootstrap_is_deterministic_and_reports_support() -> None:
    folds = [
        {
            "evaluationTransactions": 10,
            "recurrence": {
                "truePositives": 4,
                "falsePositives": 1,
                "falseNegatives": 1,
                "trueNegatives": 4,
            },
        },
        {
            "evaluationTransactions": 12,
            "recurrence": {
                "truePositives": 5,
                "falsePositives": 2,
                "falseNegatives": 1,
                "trueNegatives": 4,
            },
        },
        {
            "evaluationTransactions": 8,
            "recurrence": {
                "truePositives": 3,
                "falsePositives": 0,
                "falseNegatives": 2,
                "trueNegatives": 3,
            },
        },
    ]
    config = BootstrapConfig(iterations=300, seed=12345)
    first = bootstrap_binary_fold_metrics(folds, "recurrence", config)
    second = bootstrap_binary_fold_metrics(folds, "recurrence", config)

    assert first == second
    assert first["method"] == "month_block_percentile_bootstrap_v1"
    assert first["blocks"] == 3
    assert first["support"] == 30
    assert 0 <= first["intervals"]["precision"]["lower"] <= 1
    assert 0 <= first["intervals"]["precision"]["upper"] <= 1


def test_development_report_keeps_holdout_sealed_and_separates_validation() -> None:
    payload = _fixture_payload()
    report = run_development_evaluation(
        payload,
        bootstrap=BootstrapConfig(iterations=200, seed=77),
    )

    assert report["mode"] == "development"
    assert report["holdout"]["status"] == "sealed"
    assert [fold["evaluateMonth"] for fold in report["calibration"]["folds"]] == ["2026-07"]
    assert [fold["evaluateMonth"] for fold in report["validation"]["folds"]] == [
        "2026-08",
        "2026-09",
    ]
    assert "2026-10" not in json.dumps(report["calibration"])
    assert "2026-10" not in json.dumps(report["validation"])

    recurrence = report["validation"]["aggregate"]["recurrence"]
    confidence = recurrence["confidence"]
    assert confidence["level"] == 0.95
    assert confidence["iterations"] == 200
    assert confidence["blocks"] == 2
    assert "precision" in confidence["intervals"]
    assert "recall" in confidence["intervals"]
    assert "f1" in confidence["intervals"]


def test_holdout_requires_the_frozen_parameter_set_and_only_evaluates_holdout() -> None:
    payload = _fixture_payload()
    development = run_development_evaluation(
        payload,
        bootstrap=BootstrapConfig(iterations=200, seed=19),
    )
    parameters = EvaluationParameters.from_frozen_dict(development["frozenParameters"])
    report = run_holdout_evaluation(
        payload,
        parameters,
        bootstrap=BootstrapConfig(iterations=200, seed=19),
    )

    assert report["mode"] == "holdout"
    assert report["frozenParameters"]["fingerprint"] == parameters.fingerprint
    assert [fold["evaluateMonth"] for fold in report["holdout"]["folds"]] == ["2026-10"]
    assert report["holdout"]["aggregate"]["recurrence"]["confidence"]["blocks"] == 1
