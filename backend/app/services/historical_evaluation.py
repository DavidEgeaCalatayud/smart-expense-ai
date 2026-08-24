from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from app.services.historical_analysis_v2_1 import analyze_historical_transactions_v2_1
from app.services.intelligence_rules import TransactionSnapshot
from app.services.merchant_canonicalization import (
    MerchantIdentity,
    build_merchant_identity_map,
    merchant_stream_hint,
)


@dataclass(frozen=True)
class BinaryObservation:
    key: str
    actual: bool
    predicted: bool
    history_length: int
    merchant: str
    category: str


@dataclass(frozen=True)
class RecurringStreamLabel:
    label_id: str
    merchant: str
    active_from: str | None
    active_until: str | None
    expected_occurrences: tuple[date, ...]
    cadence: str | None
    amount_min: Decimal | None
    amount_max: Decimal | None
    descriptor_contains: str | None

    @property
    def first_known_month(self) -> str | None:
        candidates: list[str] = []
        if self.active_from:
            candidates.append(self.active_from)
        if self.expected_occurrences:
            candidates.append(min(self.expected_occurrences).strftime("%Y-%m"))
        return min(candidates) if candidates else None

    def is_relevant_by(self, month_key: str) -> bool:
        first_known = self.first_known_month
        return first_known is None or first_known <= month_key

    def is_active_in(self, month_key: str) -> bool:
        if self.expected_occurrences:
            return any(value.strftime("%Y-%m") == month_key for value in self.expected_occurrences)
        if self.active_from and month_key < self.active_from:
            return False
        if self.active_until and month_key > self.active_until:
            return False
        return True

    def amount_matches(self, amount: Decimal) -> bool:
        if self.amount_min is not None and amount < self.amount_min:
            return False
        if self.amount_max is not None and amount > self.amount_max:
            return False
        return True


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


def _parse_recurring_labels(payload: dict[str, Any]) -> list[RecurringStreamLabel]:
    labels = payload.get("labels", {})
    parsed: list[RecurringStreamLabel] = []
    for index, raw in enumerate(labels.get("recurringStreams", [])):
        occurrences = tuple(
            sorted(date.fromisoformat(str(value)) for value in raw.get("expectedOccurrences", []))
        )
        parsed.append(
            RecurringStreamLabel(
                label_id=str(raw.get("id", f"stream-{index + 1}")),
                merchant=str(raw["merchant"]),
                active_from=str(raw["activeFrom"]) if raw.get("activeFrom") else None,
                active_until=str(raw["activeUntil"]) if raw.get("activeUntil") else None,
                expected_occurrences=occurrences,
                cadence=str(raw["cadence"]) if raw.get("cadence") else None,
                amount_min=Decimal(str(raw["amountMin"])) if raw.get("amountMin") is not None else None,
                amount_max=Decimal(str(raw["amountMax"])) if raw.get("amountMax") is not None else None,
                descriptor_contains=(
                    str(raw["descriptorContains"]).casefold()
                    if raw.get("descriptorContains")
                    else None
                ),
            )
        )

    # Backwards-compatible fixture support. Legacy labels are intentionally global and
    # should not be used for new evaluation datasets because they cannot express lifecycle.
    for merchant in labels.get("recurringMerchants", []):
        parsed.append(
            RecurringStreamLabel(
                label_id=f"legacy:{merchant}",
                merchant=str(merchant),
                active_from=None,
                active_until=None,
                expected_occurrences=(),
                cadence=None,
                amount_min=None,
                amount_max=None,
                descriptor_contains=None,
            )
        )
    return parsed


def _profile_matches_label(profile: dict[str, object], label: RecurringStreamLabel) -> bool:
    if str(profile.get("canonicalMerchant", "")) != label.merchant:
        return False
    if label.cadence and str(profile.get("cadence", "")) != label.cadence:
        return False
    amount = Decimal(str(profile.get("medianAmount", "0")))
    if not label.amount_matches(amount):
        return False
    if label.descriptor_contains:
        descriptor = str(profile.get("streamDescriptor") or "").casefold()
        if label.descriptor_contains not in descriptor:
            return False
    return True


def _transaction_matches_label(
    transaction: TransactionSnapshot,
    label: RecurringStreamLabel,
    identity_map: dict[str, MerchantIdentity],
) -> bool:
    identity = identity_map[transaction.merchant]
    if identity.canonical != label.merchant or not label.amount_matches(transaction.amount):
        return False
    if label.descriptor_contains:
        hint = merchant_stream_hint(transaction.merchant, identity.canonical).casefold()
        return label.descriptor_contains in hint
    return True


def _majority_category(transactions: list[TransactionSnapshot]) -> str:
    if not transactions:
        return "unknown"
    counts: dict[str, int] = {}
    for item in transactions:
        counts[item.category] = counts.get(item.category, 0) + 1
    return max(counts, key=lambda value: (counts[value], value))


def evaluate_historical_dataset(payload: dict[str, Any]) -> dict[str, Any]:
    """Evaluate historical-v2.1 using strict chronological month-by-month folds.

    Every fold builds merchant identity exclusively from transactions available by that
    cutoff. Temporal recurrence labels are evaluated only once their lifecycle is knowable
    at the evaluation month. There is no random split and no global merchant identity map.
    """

    transactions = _parse_transactions(payload)
    if not transactions:
        return {
            "datasetVersion": payload.get("datasetVersion", "unknown"),
            "folds": [],
            "aggregate": {},
        }

    recurring_labels = _parse_recurring_labels(payload)
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
        month_key = evaluation_month.strftime("%Y-%m")
        available = [item for item in transactions if item.transaction_date <= cutoff]
        fold_identity_map = build_merchant_identity_map([item.merchant for item in available])
        eval_transactions = [
            item
            for item in available
            if item.transaction_date.year == evaluation_month.year
            and item.transaction_date.month == evaluation_month.month
        ]
        total_eval_transactions += len(eval_transactions)
        window_months = max(6, min(12, len({_month_start(item.transaction_date) for item in available})))
        _, _, _, result = analyze_historical_transactions_v2_1(
            available,
            window_months,
            analysis_end=cutoff,
            identity_map=fold_identity_map,
        )

        predicted_profiles = [
            profile
            for profile in result["recurringProfiles"]
            if profile.get("canonicalMerchant")
        ]
        predicted_anomalies = {
            str(item["transactionId"])
            for item in result["outliers"]
            if date.fromisoformat(str(item["date"])).year == evaluation_month.year
            and date.fromisoformat(str(item["date"])).month == evaluation_month.month
        }

        relevant_labels = [
            label for label in recurring_labels if label.is_relevant_by(month_key)
        ]
        relevant_labels.sort(key=lambda label: (not label.is_active_in(month_key), label.label_id))
        unused_prediction_indexes = set(range(len(predicted_profiles)))
        fold_recurrence: list[BinaryObservation] = []

        for label in relevant_labels:
            matching_prediction_index = next(
                (
                    index
                    for index in sorted(unused_prediction_indexes)
                    if _profile_matches_label(predicted_profiles[index], label)
                ),
                None,
            )
            predicted = matching_prediction_index is not None
            if matching_prediction_index is not None:
                unused_prediction_indexes.remove(matching_prediction_index)

            history = [
                item
                for item in available
                if item.transaction_date < evaluation_month
                and _transaction_matches_label(item, label, fold_identity_map)
            ]
            observation = BinaryObservation(
                key=f"{month_key}:{label.label_id}",
                actual=label.is_active_in(month_key),
                predicted=predicted,
                history_length=len(history),
                merchant=label.merchant,
                category=_majority_category(history),
            )
            fold_recurrence.append(observation)
            recurrence_observations.append(observation)

        # Any stream prediction not explained by a temporally relevant ground-truth stream
        # is a false positive. This is what makes cancellation/reactivation measurable.
        for index in sorted(unused_prediction_indexes):
            profile = predicted_profiles[index]
            canonical = str(profile["canonicalMerchant"])
            stream_key = str(profile.get("streamKey") or f"unlabelled-{index}")
            history_length = int(profile.get("occurrenceCount", 0))
            matching_history = [
                item
                for item in available
                if item.transaction_date < evaluation_month
                and fold_identity_map[item.merchant].canonical == canonical
            ]
            observation = BinaryObservation(
                key=f"{month_key}:{stream_key}:unlabelled",
                actual=False,
                predicted=True,
                history_length=history_length,
                merchant=canonical,
                category=_majority_category(matching_history),
            )
            fold_recurrence.append(observation)
            recurrence_observations.append(observation)

        fold_anomalies: list[BinaryObservation] = []
        for item in eval_transactions:
            canonical = fold_identity_map[item.merchant].canonical
            history_length = sum(
                previous.transaction_date < item.transaction_date
                and fold_identity_map[previous.merchant].canonical == canonical
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
                "evaluateMonth": month_key,
                "evaluationTransactions": len(eval_transactions),
                "identitySourceTransactions": len(available),
                "identityCanonicalMerchants": len(
                    {identity.canonical for identity in fold_identity_map.values() if identity.canonical}
                ),
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
        "analysisVersion": "historical-v2.1",
        "validationStrategy": "walk_forward_monthly_fold_local_identity",
        "labelStrategy": "temporal_recurring_streams",
        "folds": folds,
        "aggregate": {
            "recurrence": _metrics(recurrence_observations, total_eval_transactions),
            "anomalies": _metrics(anomaly_observations, total_eval_transactions),
        },
        "recurrenceByHistoryLength": recurrence_by_history,
        "recurrenceByMerchant": recurrence_by_merchant,
        "anomalyByCategory": anomaly_by_category,
    }
