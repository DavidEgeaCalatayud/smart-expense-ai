from __future__ import annotations

from pathlib import Path

import pytest

from benchmark.error_analysis import analyze_benchmark_errors
from benchmark.generator import write_dataset


def _scenario(task: dict[str, object], name: str) -> dict[str, object]:
    return next(row for row in task["byScenario"] if row["scenario"] == name)


def test_scenario_error_analysis_keeps_holdout_sealed_and_reports_tasks(tmp_path: Path) -> None:
    root = tmp_path / "benchmark_v1"
    write_dataset(root)

    report = analyze_benchmark_errors(
        root,
        phases=("calibration",),
        max_errors=5,
    )

    assert report["datasetVersion"] == "financial-benchmark-v1"
    assert report["reportVersion"] == "benchmark-scenario-errors-v3"
    assert report["mode"] == "development"
    assert report["scope"]["phases"] == ["calibration"]
    assert report["scope"]["recurrenceLabelActivity"] == (
        "cadence_continuity_nominal_boundary_v2"
    )
    assert report["scope"]["minimumStreamEvidenceOccurrences"] == 3
    assert report["holdout"]["status"] == "sealed"
    assert report["holdout"]["range"] == {
        "startMonth": "2025-07",
        "endMonth": "2025-12",
    }

    historical = report["engines"]["historical-v2.2"]["tasks"]
    rules = report["engines"]["rules-v2"]["tasks"]
    assert set(historical) == {"recurrence", "amount_anomaly"}
    assert set(rules) == {"recurrence", "amount_anomaly", "frequency_anomaly"}
    assert historical["recurrence"]["evaluationUnit"] == "recurring_stream_month"
    assert rules["frequency_anomaly"]["evaluationUnit"] == "canonical_merchant_month"
    assert any(
        row["scenario"] == "recurring_price_change"
        for row in historical["recurrence"]["byScenario"]
    )
    assert any(
        row["scenario"] == "frequency_burst"
        for row in rules["frequency_anomaly"]["byScenario"]
    )
    assert len(historical["recurrence"]["errors"]) <= 5

    # A quarterly recurring stream remains an active stream between billing months.
    # Calibration covers all 12 months of 2024, so the correctly persistent profile
    # must be scored as 12 stream-level TPs rather than 4 TPs + 8 phantom FPs.
    for recurrence in (historical["recurrence"], rules["recurrence"]):
        quarterly = _scenario(recurrence, "quarterly_price_change")
        assert (
            quarterly["truePositives"],
            quarterly["falsePositives"],
            quarterly["falseNegatives"],
        ) == (12, 0, 0)

        cancel_reactivate = _scenario(recurrence, "cancel_reactivate")
        assert cancel_reactivate["falsePositives"] == 0


def test_scenario_error_analysis_refuses_holdout(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="holdout sealed"):
        analyze_benchmark_errors(tmp_path, phases=("holdout",))
