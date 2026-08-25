from __future__ import annotations

from pathlib import Path

import pytest

from benchmark.error_analysis import analyze_benchmark_errors
from benchmark.generator import write_dataset


def test_scenario_error_analysis_keeps_holdout_sealed_and_reports_tasks(tmp_path: Path) -> None:
    root = tmp_path / "benchmark_v1"
    write_dataset(root)

    report = analyze_benchmark_errors(
        root,
        phases=("calibration",),
        max_errors=5,
    )

    assert report["datasetVersion"] == "financial-benchmark-v1"
    assert report["reportVersion"] == "benchmark-scenario-errors-v1"
    assert report["mode"] == "development"
    assert report["scope"]["phases"] == ["calibration"]
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


def test_scenario_error_analysis_refuses_holdout(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="holdout sealed"):
        analyze_benchmark_errors(tmp_path, phases=("holdout",))
