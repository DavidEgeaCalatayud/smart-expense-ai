from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.intelligence_rules import TransactionSnapshot
from app.services.intelligence_rules_v2 import run_financial_intelligence_rules_v2
from ml.isolation_forest_anomaly import evaluate_isolation_forest_challenger


def _tx(identifier: str, merchant: str, amount: str, value: date) -> TransactionSnapshot:
    return TransactionSnapshot(
        id=identifier,
        merchant=merchant,
        amount=Decimal(amount),
        transaction_date=value,
        category="Shopping",
    )


def _synthetic_fixture() -> tuple[list[TransactionSnapshot], dict[str, bool]]:
    transactions: list[TransactionSnapshot] = []
    labels: dict[str, bool] = {}
    identifier = 0
    for month in range(1, 13):
        for position, day in enumerate((3, 8, 13, 18, 23, 27)):
            identifier += 1
            is_outlier = month >= 7 and position == 5
            amount = "260.00" if is_outlier else str(38 + (position % 3))
            merchant = "Stable Market" if position < 4 else "Corner Cafe"
            transaction = _tx(
                f"synthetic-{identifier}",
                merchant,
                amount,
                date(2025, month, day),
            )
            transactions.append(transaction)
            labels[transaction.id] = is_outlier
    return transactions, labels


def _rule_anomaly_ids(
    transactions: list[TransactionSnapshot],
    *,
    through: date,
) -> set[str]:
    eligible = [item for item in transactions if item.transaction_date <= through]
    findings = run_financial_intelligence_rules_v2(eligible, analysis_date=through)
    ids: set[str] = set()
    for finding in findings:
        if finding.finding_type == "spending_anomaly":
            transaction_id = finding.evidence.get("transactionId")
            if transaction_id is not None:
                ids.add(str(transaction_id))
        elif finding.finding_type == "frequency_anomaly":
            raw_ids = finding.evidence.get("transactionIds", [])
            if isinstance(raw_ids, list):
                ids.update(str(value) for value in raw_ids)
    return ids


def build_report() -> dict[str, object]:
    transactions, labels = _synthetic_fixture()
    evaluation_end = date(2025, 10, 31)
    rules = _rule_anomaly_ids(transactions, through=evaluation_end)
    report = evaluate_isolation_forest_challenger(
        transactions,
        labels,
        fit_end=date(2025, 6, 30),
        calibration_start=date(2025, 7, 1),
        calibration_end=date(2025, 8, 31),
        evaluation_start=date(2025, 9, 1),
        evaluation_end=evaluation_end,
        rule_anomaly_ids=rules,
    )

    models = report["models"]
    supports = {entry["metrics"]["support"] for entry in models.values()}
    if supports != {12}:
        raise AssertionError(f"challenger support diverged: {supports}")
    for name, entry in models.items():
        metrics = entry["metrics"]
        for field in ("precision", "recall", "f1", "falsePositivesPer100Transactions"):
            if field not in metrics:
                raise AssertionError(f"{name} is missing {field}")
    if report["promotionDecision"]["replaceProductionRules"] is not False:
        raise AssertionError("synthetic benchmark must never auto-promote the ML challenger")

    future = _tx("future-extreme", "Stable Market", "99999.00", date(2026, 1, 1))
    future_labels = dict(labels)
    future_labels[future.id] = True
    repeated = evaluate_isolation_forest_challenger(
        transactions + [future],
        future_labels,
        fit_end=date(2025, 6, 30),
        calibration_start=date(2025, 7, 1),
        calibration_end=date(2025, 8, 31),
        evaluation_start=date(2025, 9, 1),
        evaluation_end=evaluation_end,
        rule_anomaly_ids=rules,
    )
    if repeated != report:
        raise AssertionError("future rows changed an earlier causal challenger report")

    return {
        "reportVersion": "anomaly-challenger-benchmark-v1",
        "fixture": "causal-stable-merchants-with-late-outliers-v1",
        "evaluation": report,
        "limitations": [
            "synthetic fixture performance is a reproducibility check, not representative real-world evidence",
            "rules-v2 remains the production anomaly engine",
            "no fraud-detection claim is made",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = build_report()
    payload = json.dumps(report, indent=2, sort_keys=True)
    if args.output:
        args.output.write_text(payload + "\n", encoding="utf-8")
    print(payload)


if __name__ == "__main__":
    main()
