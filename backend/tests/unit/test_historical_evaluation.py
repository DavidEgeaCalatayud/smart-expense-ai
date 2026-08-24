import json
from pathlib import Path

from app.services.historical_evaluation import evaluate_historical_dataset


def test_walk_forward_evaluation_reports_required_metrics_and_slices() -> None:
    fixture = Path(__file__).resolve().parents[2] / "evaluation" / "historical_v2_fixture.json"
    payload = json.loads(fixture.read_text(encoding="utf-8"))

    report = evaluate_historical_dataset(payload)

    assert report["datasetVersion"] == "fixture-v1"
    assert report["analysisVersion"] == "historical-v2"
    assert report["validationStrategy"] == "walk_forward_monthly"
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
