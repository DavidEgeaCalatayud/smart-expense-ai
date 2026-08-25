from __future__ import annotations

import ast
from pathlib import Path

from benchmark.dataset import build_historical_evaluation_payload, validate_benchmark
from benchmark.generator import build_dataset, write_dataset


def test_financial_benchmark_is_large_labelled_and_reproducible(tmp_path: Path) -> None:
    root = tmp_path / "benchmark_v1"
    write_dataset(root)
    summary = validate_benchmark(root)

    assert summary["transactions"] >= 2000
    assert summary["expenseTransactions"] >= 2000
    assert summary["recurringStreams"] >= 8
    assert summary["anomalyPositiveTransactions"] >= 25
    assert summary["anomalyHardNegatives"] >= 8
    assert summary["positiveAnomaliesByKind"]["amount_outlier"] >= 9
    assert summary["positiveAnomaliesByKind"]["frequency_spike"] >= 12
    assert summary["positiveAnomaliesByKind"]["duplicate_charge"] >= 4
    assert summary["transactionsByPhase"]["calibration"] >= 500
    assert summary["transactionsByPhase"]["validation"] >= 250
    assert summary["transactionsByPhase"]["holdout"] >= 250
    assert summary["reproducibility"] == "sha256_verified"

    second = build_dataset()
    for relative_path, expected in second.items():
        assert (root / relative_path).read_text(encoding="utf-8") == expected


def test_historical_payload_excludes_income_and_uses_amount_anomaly_ground_truth(tmp_path: Path) -> None:
    root = tmp_path / "benchmark_v1"
    write_dataset(root)
    payload = build_historical_evaluation_payload(root)

    assert payload["datasetVersion"] == "financial-benchmark-v1"
    assert len(payload["transactions"]) >= 2000
    assert all(item["amount"].count(".") == 1 for item in payload["transactions"])
    assert all(len(item["amount"].split(".")[1]) == 2 for item in payload["transactions"])
    assert len(payload["labels"]["recurringStreams"]) >= 8
    assert len(payload["labels"]["anomalyTransactionIds"]) >= 9
    assert payload["evaluation"]["splits"]["holdout"] == {
        "startMonth": "2025-07",
        "endMonth": "2025-12",
    }


def test_generator_is_independent_from_production_analysis_modules() -> None:
    generator_path = Path(__file__).resolve().parents[2] / "benchmark" / "generator.py"
    tree = ast.parse(generator_path.read_text(encoding="utf-8"))
    imported_modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported_modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported_modules.add(node.module)

    assert not any(name == "app" or name.startswith("app.") for name in imported_modules)
