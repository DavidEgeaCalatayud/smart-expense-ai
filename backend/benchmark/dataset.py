from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from hashlib import sha256
import json
from pathlib import Path
from typing import Any, Iterable

REQUIRED_FILES = (
    "transactions_v1.jsonl",
    "labels/recurring.json",
    "labels/anomalies.json",
    "labels/categories.json",
    "metadata.json",
)
REQUIRED_SCENARIOS = {
    "recurring_price_change", "refund_pair", "duplicate_charge", "weekly_holiday_shift",
    "cancel_reactivate", "merchant_descriptor_drift", "legitimate_exception",
    "equal_amount_temporal_streams", "same_merchant_multi_stream", "frequency_burst",
}
DEFAULT_HISTORICAL_ANOMALY_KINDS = frozenset({"amount_outlier"})

@dataclass(frozen=True)
class BenchmarkBundle:
    root: Path
    metadata: dict[str, Any]
    transactions: tuple[dict[str, Any], ...]
    recurring: dict[str, Any]
    anomalies: dict[str, Any]
    categories: dict[str, Any]


def _json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path.name} must contain an object")
    return value


def _hash(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def load_benchmark(root: Path) -> BenchmarkBundle:
    root = root.resolve()
    missing = [name for name in REQUIRED_FILES if not (root / name).is_file()]
    if missing:
        raise ValueError("benchmark is missing required files: " + ", ".join(missing))
    transactions: list[dict[str, Any]] = []
    for line_number, line in enumerate((root / "transactions_v1.jsonl").read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError(f"transactions_v1.jsonl line {line_number} must be an object")
        transactions.append(value)
    return BenchmarkBundle(
        root=root,
        metadata=_json(root / "metadata.json"),
        transactions=tuple(transactions),
        recurring=_json(root / "labels/recurring.json"),
        anomalies=_json(root / "labels/anomalies.json"),
        categories=_json(root / "labels/categories.json"),
    )


def _phase(month: str, splits: dict[str, Any]) -> str:
    for phase in ("calibration", "validation", "holdout"):
        item = splits[phase]
        if str(item["startMonth"]) <= month <= str(item["endMonth"]):
            return phase
    return "history"


def validate_benchmark(root: Path) -> dict[str, Any]:
    bundle = load_benchmark(root)
    metadata = bundle.metadata
    if metadata.get("datasetVersion") != "financial-benchmark-v1":
        raise ValueError("unexpected datasetVersion")
    provenance = metadata.get("provenance", {})
    if provenance.get("containsRealUserFinancialData") is not False:
        raise ValueError("benchmark must explicitly contain no real user financial data")
    if provenance.get("algorithmIndependentGeneration") is not True:
        raise ValueError("benchmark must declare algorithm-independent generation")

    expected_hashes = metadata.get("fileSha256")
    if not isinstance(expected_hashes, dict):
        raise ValueError("metadata.fileSha256 must be an object")
    for relative_path, expected in expected_hashes.items():
        path = bundle.root / str(relative_path)
        if not path.is_file() or _hash(path) != str(expected):
            raise ValueError(f"SHA-256 mismatch for {relative_path}")

    transactions = list(bundle.transactions)
    if len(transactions) < 2000:
        raise ValueError("benchmark must contain at least 2000 transactions")
    ids = [str(item.get("id", "")) for item in transactions]
    if any(not value for value in ids) or len(ids) != len(set(ids)):
        raise ValueError("transaction ids must be non-empty and unique")
    dates = [date.fromisoformat(str(item["date"])) for item in transactions]
    if dates != sorted(dates):
        raise ValueError("transactions_v1.jsonl must be chronological")
    for item in transactions:
        for field in ("merchant", "amount", "date", "category", "transactionType", "scenarioId"):
            if field not in item:
                raise ValueError(f"transaction {item.get('id')} is missing {field}")
        amount = str(item["amount"])
        if "." not in amount or len(amount.rsplit(".", 1)[1]) != 2:
            raise ValueError(f"transaction {item['id']} amount must be a two-decimal string")
        if item["transactionType"] not in {"expense", "income"}:
            raise ValueError(f"transaction {item['id']} has unsupported transactionType")

    if int(metadata.get("counts", {}).get("transactions", -1)) != len(transactions):
        raise ValueError("metadata transaction count mismatch")

    category_labels = bundle.categories.get("labels")
    if not isinstance(category_labels, dict) or set(category_labels) != set(ids):
        raise ValueError("category labels must cover every transaction exactly once")
    for item in transactions:
        if str(category_labels[str(item["id"])]) != str(item["category"]):
            raise ValueError(f"category label mismatch for {item['id']}")

    by_id = {str(item["id"]): item for item in transactions}
    anomaly_labels = bundle.anomalies.get("labels")
    if not isinstance(anomaly_labels, list):
        raise ValueError("anomaly labels must be a list")
    for label in anomaly_labels:
        transaction_id = str(label["transactionId"])
        if transaction_id not in by_id:
            raise ValueError(f"anomaly label references unknown transaction {transaction_id}")
        if not isinstance(label.get("isAnomaly"), bool):
            raise ValueError(f"anomaly label {transaction_id} must include boolean isAnomaly")

    streams = bundle.recurring.get("streams")
    if not isinstance(streams, list) or len(streams) < 8:
        raise ValueError("benchmark must contain at least eight recurring streams")
    for stream in streams:
        occurrences = stream.get("expectedOccurrences")
        if not isinstance(occurrences, list) or len(occurrences) < 3:
            raise ValueError(f"stream {stream.get('id')} needs at least three occurrences")
        scenario = str(stream.get("scenarioId", ""))
        for occurrence in occurrences:
            occurrence_date = str(occurrence["date"] if isinstance(occurrence, dict) else occurrence)
            occurrence_amount = str(occurrence.get("amount")) if isinstance(occurrence, dict) and occurrence.get("amount") is not None else None
            candidates = [item for item in transactions if str(item["date"]) == occurrence_date and str(item["scenarioId"]) == scenario and item["transactionType"] == "expense"]
            if occurrence_amount is not None:
                candidates = [item for item in candidates if str(item["amount"]) == occurrence_amount]
            if not candidates:
                raise ValueError(f"stream occurrence {stream.get('id')}@{occurrence_date} has no source transaction")

    scenarios = {str(item["scenarioId"]) for item in transactions}
    missing_scenarios = sorted(REQUIRED_SCENARIOS - scenarios)
    if missing_scenarios:
        raise ValueError("missing required scenarios: " + ", ".join(missing_scenarios))

    evaluation = metadata.get("evaluation")
    if not isinstance(evaluation, dict) or not isinstance(evaluation.get("splits"), dict):
        raise ValueError("metadata.evaluation.splits must be an object")
    splits = evaluation["splits"]
    if str(splits["calibration"]["endMonth"]) >= str(splits["validation"]["startMonth"]):
        raise ValueError("calibration must end before validation")
    if str(splits["validation"]["endMonth"]) >= str(splits["holdout"]["startMonth"]):
        raise ValueError("validation must end before holdout")

    phase_counts = {"history": 0, "calibration": 0, "validation": 0, "holdout": 0}
    for item in transactions:
        phase_counts[_phase(str(item["date"])[:7], splits)] += 1
    if phase_counts["calibration"] < 500 or phase_counts["validation"] < 250 or phase_counts["holdout"] < 250:
        raise ValueError("benchmark split sizes are below minimum quality thresholds")

    positives = [item for item in anomaly_labels if item["isAnomaly"] is True]
    positives_by_kind: dict[str, int] = {}
    for item in positives:
        kind = str(item["kind"])
        positives_by_kind[kind] = positives_by_kind.get(kind, 0) + 1
    if not {"amount_outlier", "frequency_spike", "duplicate_charge"}.issubset(positives_by_kind):
        raise ValueError("benchmark does not cover required anomaly positive kinds")
    hard_negatives = [item for item in anomaly_labels if item["isAnomaly"] is False and item["kind"] in {"legitimate_exception", "refund_related_purchase"}]
    if len(hard_negatives) < 8:
        raise ValueError("benchmark needs at least eight curated anomaly hard negatives")

    partial_months = metadata.get("observationCoverage", {}).get("partialMonths", {})
    for month in partial_months:
        if _phase(str(month), splits) != "history":
            raise ValueError("partial months must remain outside evaluation target splits")

    return {
        "datasetVersion": metadata["datasetVersion"],
        "transactions": len(transactions),
        "expenseTransactions": sum(item["transactionType"] == "expense" for item in transactions),
        "recurringStreams": len(streams),
        "anomalyPositiveTransactions": len(positives),
        "anomalyHardNegatives": len(hard_negatives),
        "positiveAnomaliesByKind": positives_by_kind,
        "transactionsByPhase": phase_counts,
        "scenarioCount": len(scenarios),
        "reproducibility": "sha256_verified",
    }


def build_historical_evaluation_payload(root: Path, *, anomaly_kinds: Iterable[str] = DEFAULT_HISTORICAL_ANOMALY_KINDS) -> dict[str, Any]:
    bundle = load_benchmark(root)
    validate_benchmark(root)
    selected = {str(value) for value in anomaly_kinds}
    return {
        "datasetVersion": bundle.metadata["datasetVersion"],
        "description": "Curated deterministic synthetic benchmark; expense rows only in historical evaluator payload.",
        "evaluation": bundle.metadata["evaluation"],
        "labels": {
            "recurringStreams": bundle.recurring["streams"],
            "anomalyTransactionIds": [str(label["transactionId"]) for label in bundle.anomalies["labels"] if label["isAnomaly"] is True and str(label["kind"]) in selected],
        },
        "transactions": [
            {"id": str(item["id"]), "merchant": str(item["merchant"]), "amount": str(item["amount"]), "date": str(item["date"]), "category": str(item["category"])}
            for item in bundle.transactions if item["transactionType"] == "expense"
        ],
    }
