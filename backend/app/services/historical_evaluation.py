from __future__ import annotations

from calendar import monthrange
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from app.services.historical_analysis_v2 import analyze_historical_transactions_v2
from app.services.intelligence_rules import TransactionSnapshot
from app.services.merchant_canonicalization import build_merchant_identity_map


@dataclass(frozen=True)
class BinaryObservation:
    key: str
    actual: bool
    predicted: bool
    history_length: int
    merchant: str
    category: str


def _metrics(observations: list[BinaryObservation], transaction_count: int) -> dict[str, float | int]:
    tp = sum(item.actual and item.predicted for item in observations)
    fp = sum(not item.actual and item.predicted for item in observations)
    fn = sum(item.actual and not item.predicted for item in observations)
    tn = sum(not item.actual and not item.predicted for item in observations)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    false_positives_per_100 = (fp / transaction_count * 100) if transaction_count else 0.0
    return {
        "truePositives": tp,
        "falsePositives": fp,
        "falseNegatives": fn,
        "trueNegatives": tn,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "falsePositivesPer100Transactions": round(false_positives_per_100, 2),
    }


def _month_start(value: date) -> date:
    return date(value.year, value.month, 1)


def _month_end(value: date) -> date:
    return date(value.year, value.month, monthrange(value.year, value.month)[1])


def _history_bucket(length: int) -> str:
    if length < 4:
        return "0-3"
    if length < 8:
        return "4-7"
    return "8+"


def _parse_transactions(payload: dict[str, Any]) -> list[TransactionSnapshot]:
    transactions: list[TransactionSnapshot] = []
    for raw in payload.get("transactions", []):
        transactions.append(
            TransactionSnapshot(
                id=str(raw["id"]),
                merchant=str(raw["merchant"]),
                amount=Decimal(str(raw["amount"])),
                transaction_date=date.fromisoformat(str(raw["date"])),
                category=str(raw["category"]),
            )
        )
    return sorted(transactions, key=lambda item: (item.transaction_date, item.id))


def evaluate_historical_dataset(payload: dict[str, Any]) -> dict[str, Any]:
    """Evaluate historical-v2 using chronological month-by-month walk-forward folds.

    The harness never random-splits time series. Each fold exposes all transactions up to
    the end of the evaluation month, while the anomaly detector itself is still required
    to build each candidate baseline from strictly earlier transactions.
    """

    transactions = _parse_transactions(payload)
    if not transactions:
        return {
            "datasetVersion": payload.get("datasetVersion", "unknown"),
            "folds": [],
            "aggregate": {},
        }

    identity_map = build_merchant_identity_map([item.merchant for item in transactions])
    recurring_labels = {str(value) for value in payload.get("labels", {}).get("recurringMerchants", [])}
    anomaly_labels = {str(value) for value in payload.get("labels", {}).get("anomalyTransactionIds", [])}
    min_history_months = int(payload.get("evaluation", {}).get("minimumHistoryMonths", 6))

    months = sorted({_month_start(item.transaction_date) for item in transactions})
    evaluation_months = months[min_history_months:]
    folds: list[dict[str, Any]] = []
    recurrence_observations: list[BinaryObservation] = []
    anomaly_observations: list[BinaryObservation] = []
    total_eval_transactions = 0

    for evaluation_month in evaluation_months:
        cutoff = _month_end(evaluation_month)
        available = [item for item in transactions if item.transaction_date <= cutoff]
        eval_transactions = [
            item
            for item in available
            if item.transaction_date.year == evaluation_month.year
            and item.transaction_date.month == evaluation_month.month
        ]
        total_eval_transactions += len(eval_transactions)
        window_months = max(6, min(12, len({_month_start(item.transaction_date) for item in available})))
        _, _, _, result = analyze_historical_transactions_v2(
            available,
            window_months,
            analysis_end=cutoff,
        )

        predicted_recurring = {
            str(profile["canonicalMerchant"])
            for profile in result["recurringProfiles"]
            if profile.get("canonicalMerchant")
        }
        predicted_anomalies = {
            str(item["transactionId"])
            for item in result["outliers"]
            if date.fromisoformat(str(item["date"])).year == evaluation_month.year
            and date.fromisoformat(str(item["date"])).month == evaluation_month.month
        }

        merchants_in_scope = {
            getattr(identity_map[item.merchant], "canonical")
            for item in available
            if getattr(identity_map[item.merchant], "canonical")
        }
        fold_recurrence: list[BinaryObservation] = []
        for merchant in sorted(merchants_in_scope):
            merchant_history = [
                item for item in available
                if getattr(identity_map[item.merchant], "canonical") == merchant
                and item.transaction_date < evaluation_month
            ]
            categories = [item.category for item in merchant_history]
            category = max(set(categories), key=categories.count) if categories else "unknown"
            observation = BinaryObservation(
                key=f"{evaluation_month.isoformat()}:{merchant}",
                actual=merchant in recurring_labels,
                predicted=merchant in predicted_recurring,
                history_length=len(merchant_history),
                merchant=merchant,
                category=category,
            )
            fold_recurrence.append(observation)
            recurrence_observations.append(observation)

        fold_anomalies: list[BinaryObservation] = []
        for item in eval_transactions:
            canonical = getattr(identity_map[item.merchant], "canonical")
            history_length = sum(
                previous.transaction_date < item.transaction_date
                and getattr(identity_map[previous.merchant], "canonical") == canonical
                for previous in available
            )
            observation = BinaryObservation(
                key=item.id,
                actual=item.id in anomaly_labels,
                predicted=item.id in predicted_anomalies,
                history_length=history_length,
                merchant=canonical,
                category=item.category,
            )
            fold_anomalies.append(observation)
            anomaly_observations.append(observation)

        folds.append(
            {
                "baselineThrough": (evaluation_month.replace(day=1) - date.resolution).isoformat(),
                "evaluateMonth": evaluation_month.strftime("%Y-%m"),
                "evaluationTransactions": len(eval_transactions),
                "recurrence": _metrics(fold_recurrence, len(eval_transactions)),
                "anomalies": _metrics(fold_anomalies, len(eval_transactions)),
            }
        )

    recurrence_by_history: dict[str, dict[str, float | int]] = {}
    for bucket in ("0-3", "4-7", "8+"):
        values = [item for item in recurrence_observations if _history_bucket(item.history_length) == bucket]
        recurrence_by_history[bucket] = _metrics(values, total_eval_transactions)

    recurrence_by_merchant = {
        merchant: _metrics(
            [item for item in recurrence_observations if item.merchant == merchant],
            total_eval_transactions,
        )
        for merchant in sorted({item.merchant for item in recurrence_observations})
    }
    anomaly_by_category = {
        category: _metrics(
            [item for item in anomaly_observations if item.category == category],
            sum(item.category == category for item in anomaly_observations),
        )
        for category in sorted({item.category for item in anomaly_observations})
    }

    return {
        "datasetVersion": payload.get("datasetVersion", "unknown"),
        "analysisVersion": "historical-v2",
        "validationStrategy": "walk_forward_monthly",
        "folds": folds,
        "aggregate": {
            "recurrence": _metrics(recurrence_observations, total_eval_transactions),
            "anomalies": _metrics(anomaly_observations, total_eval_transactions),
        },
        "recurrenceByHistoryLength": recurrence_by_history,
        "recurrenceByMerchant": recurrence_by_merchant,
        "anomalyByCategory": anomaly_by_category,
    }
