from __future__ import annotations

import json

import pytest

from benchmark.generator import write_dataset
from ml.category_classifier import FEATURE_POLICY, MODEL_VERSION, CategoryClassifier
from ml.category_evaluation import build_category_evaluation_report


def test_category_classifier_is_deterministic_and_probability_rows_are_complete() -> None:
    merchants = [
        "Mercado Central",
        "Fresh Market",
        "Cafe Plaza",
        "Fuel Station",
        "Metro Transit",
        "Ride Cab",
        "Book House",
        "Fashion Corner",
        "Tech Outlet",
    ]
    categories = [
        "Food",
        "Food",
        "Food",
        "Transport",
        "Transport",
        "Transport",
        "Shopping",
        "Shopping",
        "Shopping",
    ]
    first = CategoryClassifier().fit(merchants, categories)
    second = CategoryClassifier().fit(merchants, categories)

    queries = ["Fresh Market", "Fuel Station", "Fashion Corner"]
    assert first.predict(queries) == second.predict(queries)
    assert first.classes_ == ["Food", "Shopping", "Transport"]

    rows = first.predict_with_probabilities(queries)
    assert len(rows) == len(queries)
    assert all(set(row.probabilities) == set(first.classes_) for row in rows)
    assert all(0.0 <= row.confidence <= 1.0 for row in rows)
    assert all(abs(sum(row.probabilities.values()) - 1.0) < 1e-9 for row in rows)


def test_category_classifier_requires_labelled_multiclass_history() -> None:
    with pytest.raises(ValueError, match="two labelled examples"):
        CategoryClassifier().fit(["Only merchant"], ["Food"])
    with pytest.raises(ValueError, match="two categories"):
        CategoryClassifier().fit(["One", "Two"], ["Food", "Food"])
    with pytest.raises(RuntimeError, match="must be fitted"):
        CategoryClassifier().predict(["Unknown"])


def test_category_evaluation_report_keeps_holdout_sealed_and_adds_cold_start_evidence(tmp_path) -> None:
    dataset = tmp_path / "benchmark"
    write_dataset(dataset)
    report = build_category_evaluation_report(dataset)
    metadata = json.loads((dataset / "metadata.json").read_text(encoding="utf-8"))

    assert report["reportVersion"] == "category-classifier-evaluation-v2"
    assert report["model"]["version"] == MODEL_VERSION
    assert report["model"]["featurePolicy"] == FEATURE_POLICY
    assert report["model"]["featureFields"] == ["merchant"]
    assert report["model"]["productConfidenceEnabled"] is False
    assert report["labelCoverage"]["total"] == metadata["counts"]["transactions"]

    split_counts = report["labelCoverage"]["bySplit"]
    assert report["calibration"]["fitSamples"] == split_counts["history"]
    assert report["calibration"]["evaluationSamples"] == split_counts["calibration"]
    assert report["validation"]["fitSamples"] == (
        split_counts["history"] + split_counts["calibration"]
    )
    assert report["validation"]["evaluationSamples"] == split_counts["validation"]
    assert report["holdout"] == {
        "status": "sealed",
        "range": {"startMonth": "2025-07", "endMonth": "2025-12"},
        "labelCount": split_counts["holdout"],
        "usedForFit": False,
        "usedForMetrics": False,
    }

    validation = report["validation"]
    assert 0.0 <= validation["metrics"]["macroF1"] <= 1.0
    assert 0.0 <= validation["metrics"]["accuracy"] <= 1.0
    labels = validation["confusionMatrix"]["labels"]
    matrix = validation["confusionMatrix"]["matrix"]
    assert set(labels) == set(validation["perCategory"])
    assert len(matrix) == len(labels)
    assert all(len(row) == len(labels) for row in matrix)
    assert sum(sum(row) for row in matrix) == validation["evaluationSamples"]
    assert validation["merchantCoverage"]["seen"]["support"] + validation["merchantCoverage"]["unseen"]["support"] == validation["evaluationSamples"]

    cold_start = report["merchantGroupHoldout"]
    assert cold_start["policy"] == "canonical_merchant_group_disjoint_v1"
    assert cold_start["merchantGroupOverlap"] == 0
    assert cold_start["evaluationMerchantGroups"] > 0
    assert cold_start["evaluationSamples"] >= 100
    assert cold_start["evaluationCategories"]

    calibration_analysis = report["calibrationAnalysis"]
    assert calibration_analysis["productConfidenceEnabled"] is False
    assert calibration_analysis["fitSamples"] == split_counts["history"]
    assert calibration_analysis["calibrationSamples"] == split_counts["calibration"]
    assert calibration_analysis["evaluationSamples"] == split_counts["validation"]
    assert set(calibration_analysis["methods"]) == {"raw", "platt", "isotonic"}
    for method in calibration_analysis["methods"].values():
        assert method["brierScore"] >= 0.0
        assert 0.0 <= method["expectedCalibrationError"] <= 1.0
        assert len(method["reliabilityDiagram"]) == 10
        assert sum(bucket["count"] for bucket in method["reliabilityDiagram"]) == split_counts["validation"]

    off_diagonal_errors = sum(
        value
        for row_index, row in enumerate(matrix)
        for column_index, value in enumerate(row)
        if row_index != column_index
    )
    assert len(validation["errors"]) == off_diagonal_errors
    assert all(error["actual"] != error["predicted"] for error in validation["errors"])
