from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterable, Mapping

from app.services.historical_analysis_v2_2 import analyze_historical_transactions_v2_2
from app.services.historical_matching import optimal_recurring_matching
from app.services.intelligence_rules import TransactionSnapshot
from app.services.intelligence_rules_v2 import (
    detect_amount_anomalies_v2,
    detect_frequency_anomalies_v2,
    detect_recurring_patterns_v2,
)
from app.services.merchant_canonicalization import (
    MerchantIdentity,
    build_merchant_identity_map,
    merchant_stream_hint,
)
from app.services.recurrence_label_activity import (
    MIN_STREAM_EVIDENCE_OCCURRENCES,
    RECURRENCE_LABEL_ACTIVITY_POLICY,
    recurring_stream_active_in,
)
from benchmark.dataset import BenchmarkBundle, load_benchmark, validate_benchmark


DEVELOPMENT_PHASES = ("calibration", "validation")
UNATTRIBUTED_SCENARIO = "unattributed_prediction"


@dataclass(frozen=True)
class RecurringScenarioLabel:
    label_id: str
    merchant: str
    scenario_id: str
    expected_occurrences: tuple[date, ...]
    cadence: str | None
    amount_min: Decimal | None
    amount_max: Decimal | None
    descriptor_contains: str | None
    calendar_signature: str | None

    @property
    def first_known_month(self) -> str | None:
        if not self.expected_occurrences:
            return None
        return min(self.expected_occurrences).strftime("%Y-%m")

    def is_relevant_by(self, month_key: str) -> bool:
        first = self.first_known_month
        return first is None or first <= month_key

    def is_active_in(self, month_key: str) -> bool:
        return recurring_stream_active_in(
            self.expected_occurrences,
            self.cadence,
            month_key,
        )


@dataclass(frozen=True)
class DiagnosticOutcome:
    key: str
    phase: str
    month: str
    scenario: str
    actual: bool
    predicted: bool
    merchant: str
    detail: dict[str, object]

    @property
    def error_type(self) -> str | None:
        if self.predicted and not self.actual:
            return "FP"
        if self.actual and not self.predicted:
            return "FN"
        return None


def _month_end(month_key: str) -> date:
    year, month = (int(value) for value in month_key.split("-"))
    if month == 12:
        next_month = date(year + 1, 1, 1)
    else:
        next_month = date(year, month + 1, 1)
    return next_month - date.resolution


def _months(start_month: str, end_month: str) -> list[str]:
    year, month = (int(value) for value in start_month.split("-"))
    end_year, end_month_number = (int(value) for value in end_month.split("-"))
    values: list[str] = []
    while (year, month) <= (end_year, end_month_number):
        values.append(f"{year:04d}-{month:02d}")
        if month == 12:
            year, month = year + 1, 1
        else:
            month += 1
    return values


def _parse_transactions(bundle: BenchmarkBundle) -> tuple[list[TransactionSnapshot], dict[str, str]]:
    transactions: list[TransactionSnapshot] = []
    scenario_by_transaction: dict[str, str] = {}
    for raw in bundle.transactions:
        if raw["transactionType"] != "expense":
            continue
        transaction_id = str(raw["id"])
        transactions.append(
            TransactionSnapshot(
                id=transaction_id,
                merchant=str(raw["merchant"]),
                amount=Decimal(str(raw["amount"])),
                transaction_date=date.fromisoformat(str(raw["date"])),
                category=str(raw["category"]),
            )
        )
        scenario_by_transaction[transaction_id] = str(raw["scenarioId"])
    transactions.sort(key=lambda item: (item.transaction_date, item.id))
    return transactions, scenario_by_transaction


def _parse_occurrence_date(raw: object) -> date:
    if isinstance(raw, str):
        return date.fromisoformat(raw)
    if isinstance(raw, dict) and "date" in raw:
        return date.fromisoformat(str(raw["date"]))
    raise ValueError("expectedOccurrences entries must be ISO dates or {date, amount?} objects")


def _parse_recurring_labels(bundle: BenchmarkBundle) -> list[RecurringScenarioLabel]:
    labels: list[RecurringScenarioLabel] = []
    for index, raw in enumerate(bundle.recurring.get("streams", [])):
        labels.append(
            RecurringScenarioLabel(
                label_id=str(raw.get("id", f"stream-{index + 1}")),
                merchant=str(raw["merchant"]),
                scenario_id=str(raw.get("scenarioId", "unknown")),
                expected_occurrences=tuple(
                    sorted(_parse_occurrence_date(value) for value in raw.get("expectedOccurrences", []))
                ),
                cadence=str(raw["cadence"]) if raw.get("cadence") else None,
                amount_min=Decimal(str(raw["amountMin"])) if raw.get("amountMin") is not None else None,
                amount_max=Decimal(str(raw["amountMax"])) if raw.get("amountMax") is not None else None,
                descriptor_contains=(
                    str(raw["descriptorContains"]).casefold()
                    if raw.get("descriptorContains")
                    else None
                ),
                calendar_signature=(
                    str(raw["calendarSignature"])
                    if raw.get("calendarSignature")
                    else None
                ),
            )
        )
    return labels


def _identity_map(transactions: list[TransactionSnapshot]) -> dict[str, MerchantIdentity]:
    return build_merchant_identity_map([item.merchant for item in transactions])


def _profile_scenario(
    profile: Mapping[str, object],
    available: list[TransactionSnapshot],
    identities: dict[str, MerchantIdentity],
    scenario_by_transaction: dict[str, str],
) -> str:
    canonical = str(profile.get("canonicalMerchant") or "")
    descriptor = str(profile.get("streamDescriptor") or "").casefold()
    candidates = [
        item for item in available
        if canonical and identities[item.merchant].canonical == canonical
    ]
    if descriptor:
        descriptor_candidates = [
            item
            for item in candidates
            if descriptor in merchant_stream_hint(item.merchant, canonical).casefold()
        ]
        if descriptor_candidates:
            candidates = descriptor_candidates
    counts = Counter(scenario_by_transaction.get(item.id, UNATTRIBUTED_SCENARIO) for item in candidates)
    if not counts:
        return UNATTRIBUTED_SCENARIO
    highest = max(counts.values())
    return sorted(scenario for scenario, count in counts.items() if count == highest)[0]


def _finding_profiles(findings: Iterable[object]) -> list[dict[str, object]]:
    profiles: list[dict[str, object]] = []
    for finding in findings:
        if getattr(finding, "finding_type", None) != "recurring_pattern":
            continue
        evidence = getattr(finding, "evidence")
        profiles.append(
            {
                "canonicalMerchant": evidence.get("canonicalMerchant"),
                "streamCalendar": evidence.get("streamCalendar"),
                "streamDescriptor": evidence.get("streamDescriptor"),
                "cadence": evidence.get("cadence"),
                "medianAmount": evidence.get("medianAmount"),
                "streamKey": evidence.get("streamKey"),
            }
        )
    return profiles


def _recurrence_outcomes(
    *,
    profiles: list[dict[str, object]],
    labels: list[RecurringScenarioLabel],
    phase: str,
    month_key: str,
    available: list[TransactionSnapshot],
    identities: dict[str, MerchantIdentity],
    scenario_by_transaction: dict[str, str],
) -> list[DiagnosticOutcome]:
    relevant_labels = [label for label in labels if label.is_relevant_by(month_key)]
    active_indexes = {
        index for index, label in enumerate(relevant_labels) if label.is_active_in(month_key)
    }
    matching = optimal_recurring_matching(
        relevant_labels,
        profiles,
        active_label_indexes=active_indexes,
    )
    prediction_by_label = {pair.label_index: pair.profile_index for pair in matching.pairs}
    outcomes: list[DiagnosticOutcome] = []

    for label_index, label in enumerate(relevant_labels):
        profile_index = prediction_by_label.get(label_index)
        outcomes.append(
            DiagnosticOutcome(
                key=f"{month_key}:{label.label_id}",
                phase=phase,
                month=month_key,
                scenario=label.scenario_id,
                actual=label.is_active_in(month_key),
                predicted=profile_index is not None,
                merchant=label.merchant,
                detail={
                    "labelId": label.label_id,
                    "cadence": label.cadence or "unknown",
                    "matchedStreamKey": (
                        str(profiles[profile_index].get("streamKey") or "")
                        if profile_index is not None
                        else ""
                    ),
                },
            )
        )

    for profile_index in matching.unmatched_profile_indexes:
        profile = profiles[profile_index]
        canonical = str(profile.get("canonicalMerchant") or "unknown")
        outcomes.append(
            DiagnosticOutcome(
                key=f"{month_key}:{profile.get('streamKey') or profile_index}:unmatched",
                phase=phase,
                month=month_key,
                scenario=_profile_scenario(
                    profile,
                    available,
                    identities,
                    scenario_by_transaction,
                ),
                actual=False,
                predicted=True,
                merchant=canonical,
                detail={
                    "streamKey": str(profile.get("streamKey") or ""),
                    "cadence": str(profile.get("cadence") or "unknown"),
                    "streamCalendar": str(profile.get("streamCalendar") or ""),
                    "streamDescriptor": str(profile.get("streamDescriptor") or ""),
                },
            )
        )
    return outcomes


def _transaction_anomaly_outcomes(
    *,
    phase: str,
    month_key: str,
    eval_transactions: list[TransactionSnapshot],
    predicted_ids: set[str],
    positive_ids: set[str],
    scenario_by_transaction: dict[str, str],
) -> list[DiagnosticOutcome]:
    return [
        DiagnosticOutcome(
            key=item.id,
            phase=phase,
            month=month_key,
            scenario=scenario_by_transaction[item.id],
            actual=item.id in positive_ids,
            predicted=item.id in predicted_ids,
            merchant=item.merchant,
            detail={
                "transactionId": item.id,
                "amount": format(item.amount, "f"),
                "category": item.category,
                "date": item.transaction_date.isoformat(),
            },
        )
        for item in eval_transactions
    ]


def _frequency_outcomes(
    *,
    bundle: BenchmarkBundle,
    phase: str,
    month_key: str,
    available: list[TransactionSnapshot],
    eval_transactions: list[TransactionSnapshot],
    identities: dict[str, MerchantIdentity],
    findings: list[object],
    scenario_by_transaction: dict[str, str],
) -> list[DiagnosticOutcome]:
    transaction_by_id = {item.id: item for item in available}
    actual_by_canonical: dict[str, str] = {}
    for label in bundle.anomalies.get("labels", []):
        if not label.get("isAnomaly") or str(label.get("kind")) != "frequency_spike":
            continue
        transaction_id = str(label["transactionId"])
        transaction = transaction_by_id.get(transaction_id)
        if transaction is None or transaction.transaction_date.strftime("%Y-%m") != month_key:
            continue
        canonical = identities[transaction.merchant].canonical
        if canonical:
            actual_by_canonical[canonical] = str(label.get("scenarioId", "unknown"))

    predicted_by_canonical: dict[str, object] = {}
    for finding in findings:
        if getattr(finding, "finding_type", None) != "frequency_anomaly":
            continue
        evidence = getattr(finding, "evidence")
        if str(evidence.get("period")) != month_key:
            continue
        canonical = str(evidence.get("canonicalMerchant") or "")
        if canonical:
            predicted_by_canonical[canonical] = finding

    outcomes: list[DiagnosticOutcome] = []
    for canonical in sorted(set(actual_by_canonical) | set(predicted_by_canonical)):
        actual = canonical in actual_by_canonical
        predicted = canonical in predicted_by_canonical
        if actual:
            scenario = actual_by_canonical[canonical]
        else:
            month_items = [
                item for item in eval_transactions if identities[item.merchant].canonical == canonical
            ]
            counts = Counter(scenario_by_transaction[item.id] for item in month_items)
            scenario = counts.most_common(1)[0][0] if counts else UNATTRIBUTED_SCENARIO
        finding = predicted_by_canonical.get(canonical)
        evidence = getattr(finding, "evidence", {}) if finding is not None else {}
        outcomes.append(
            DiagnosticOutcome(
                key=f"{month_key}:{canonical}",
                phase=phase,
                month=month_key,
                scenario=scenario,
                actual=actual,
                predicted=predicted,
                merchant=canonical,
                detail={
                    "evaluationUnit": "canonical_merchant_month",
                    "currentCount": evidence.get("currentCount"),
                    "baselineMedianCount": evidence.get("baselineMedianCount"),
                    "maxChargesIn7Days": evidence.get("maxChargesIn7Days"),
                },
            )
        )
    return outcomes


def _metrics(outcomes: Iterable[DiagnosticOutcome]) -> dict[str, float | int]:
    values = list(outcomes)
    tp = sum(item.actual and item.predicted for item in values)
    fp = sum(not item.actual and item.predicted for item in values)
    fn = sum(item.actual and not item.predicted for item in values)
    tn = sum(not item.actual and not item.predicted for item in values)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "truePositives": tp,
        "falsePositives": fp,
        "falseNegatives": fn,
        "trueNegatives": tn,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "positiveSupport": tp + fn,
        "predictionSupport": tp + fp,
    }


def _scenario_matrix(
    outcomes: list[DiagnosticOutcome],
    *,
    false_positive_weight: float,
    false_negative_weight: float,
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for scenario in sorted({item.scenario for item in outcomes}):
        metrics = _metrics(item for item in outcomes if item.scenario == scenario)
        rows.append(
            {
                "scenario": scenario,
                **metrics,
                "weightedErrorCost": round(
                    metrics["falsePositives"] * false_positive_weight
                    + metrics["falseNegatives"] * false_negative_weight,
                    4,
                ),
            }
        )
    return rows


def _summarize_task(
    outcomes: list[DiagnosticOutcome],
    *,
    false_positive_weight: float,
    false_negative_weight: float,
    max_errors: int,
    evaluation_unit: str,
) -> dict[str, object]:
    errors = [item for item in outcomes if item.error_type is not None]
    errors.sort(key=lambda item: (item.phase, item.month, item.scenario, item.error_type or "", item.key))
    phases = sorted({item.phase for item in outcomes})
    return {
        "evaluationUnit": evaluation_unit,
        "overall": _metrics(outcomes),
        "byPhase": {
            phase: _metrics(item for item in outcomes if item.phase == phase)
            for phase in phases
        },
        "byScenario": _scenario_matrix(
            outcomes,
            false_positive_weight=false_positive_weight,
            false_negative_weight=false_negative_weight,
        ),
        "errorCount": len(errors),
        "errors": [
            {
                "type": item.error_type,
                "phase": item.phase,
                "month": item.month,
                "scenario": item.scenario,
                "key": item.key,
                "merchant": item.merchant,
                "detail": item.detail,
            }
            for item in errors[:max_errors]
        ],
    }


def _target_months(bundle: BenchmarkBundle, phases: tuple[str, ...]) -> list[tuple[str, str]]:
    splits = bundle.metadata["evaluation"]["splits"]
    targets: list[tuple[str, str]] = []
    for phase in phases:
        split = splits[phase]
        targets.extend(
            (phase, month)
            for month in _months(str(split["startMonth"]), str(split["endMonth"]))
        )
    return targets


def _validate_phases(phases: tuple[str, ...]) -> None:
    if not phases:
        raise ValueError("at least one development phase is required")
    unsupported = sorted(set(phases) - set(DEVELOPMENT_PHASES))
    if unsupported:
        raise ValueError(
            "scenario error analysis intentionally keeps holdout sealed; allowed phases are "
            + ", ".join(DEVELOPMENT_PHASES)
        )


def analyze_benchmark_errors(
    root: Path,
    *,
    phases: tuple[str, ...] = DEVELOPMENT_PHASES,
    false_positive_weight: float = 2.0,
    false_negative_weight: float = 1.0,
    max_errors: int = 50,
) -> dict[str, object]:
    """Run scenario-level development diagnostics without opening the benchmark holdout.

    The report deliberately scores only tasks whose benchmark labels match the production
    signal semantics. `historical-v2.2` is scored for recurring-stream detection and amount
    outliers. `rules-v2` additionally receives merchant-month frequency-anomaly scoring.
    Duplicate-subscription and missing-payment findings remain unscored until explicit labels
    for those user-facing signals exist.
    """

    _validate_phases(phases)
    if false_positive_weight < 0 or false_negative_weight < 0:
        raise ValueError("error weights must be non-negative")
    if max_errors < 0:
        raise ValueError("max_errors must be non-negative")

    validate_benchmark(root)
    bundle = load_benchmark(root)
    transactions, scenario_by_transaction = _parse_transactions(bundle)
    recurring_labels = _parse_recurring_labels(bundle)
    amount_positive_ids = {
        str(label["transactionId"])
        for label in bundle.anomalies.get("labels", [])
        if label.get("isAnomaly") is True and str(label.get("kind")) == "amount_outlier"
    }

    historical_recurrence: list[DiagnosticOutcome] = []
    historical_amount: list[DiagnosticOutcome] = []
    rules_recurrence: list[DiagnosticOutcome] = []
    rules_amount: list[DiagnosticOutcome] = []
    rules_frequency: list[DiagnosticOutcome] = []
    unscored_rule_counts = Counter()

    for phase, month_key in _target_months(bundle, phases):
        cutoff = _month_end(month_key)
        available = [item for item in transactions if item.transaction_date <= cutoff]
        eval_transactions = [
            item for item in available if item.transaction_date.strftime("%Y-%m") == month_key
        ]
        identities = _identity_map(available)
        window_months = max(
            6,
            min(12, len({item.transaction_date.strftime("%Y-%m") for item in available})),
        )

        _, _, _, historical_result = analyze_historical_transactions_v2_2(
            available,
            window_months,
            analysis_end=cutoff,
            identity_map=identities,
        )
        historical_profiles = [
            dict(profile)
            for profile in historical_result.get("recurringProfiles", [])
            if profile.get("canonicalMerchant")
        ]
        historical_recurrence.extend(
            _recurrence_outcomes(
                profiles=historical_profiles,
                labels=recurring_labels,
                phase=phase,
                month_key=month_key,
                available=available,
                identities=identities,
                scenario_by_transaction=scenario_by_transaction,
            )
        )
        historical_predicted_amount = {
            str(item["transactionId"])
            for item in historical_result.get("outliers", [])
            if str(item.get("date", ""))[:7] == month_key
        }
        historical_amount.extend(
            _transaction_anomaly_outcomes(
                phase=phase,
                month_key=month_key,
                eval_transactions=eval_transactions,
                predicted_ids=historical_predicted_amount,
                positive_ids=amount_positive_ids,
                scenario_by_transaction=scenario_by_transaction,
            )
        )

        recurring_findings = detect_recurring_patterns_v2(
            available,
            analysis_date=cutoff,
            identities=identities,
        )
        rule_profiles = _finding_profiles(recurring_findings)
        rules_recurrence.extend(
            _recurrence_outcomes(
                profiles=rule_profiles,
                labels=recurring_labels,
                phase=phase,
                month_key=month_key,
                available=available,
                identities=identities,
                scenario_by_transaction=scenario_by_transaction,
            )
        )
        unscored_rule_counts["recurring_payment_missing"] += sum(
            getattr(item, "finding_type", None) == "recurring_payment_missing"
            for item in recurring_findings
        )

        amount_findings = detect_amount_anomalies_v2(available, identities=identities)
        rules_predicted_amount = {
            str(getattr(item, "evidence").get("transactionId"))
            for item in amount_findings
            if str(getattr(item, "evidence").get("transactionDate", ""))[:7] == month_key
        }
        rules_amount.extend(
            _transaction_anomaly_outcomes(
                phase=phase,
                month_key=month_key,
                eval_transactions=eval_transactions,
                predicted_ids=rules_predicted_amount,
                positive_ids=amount_positive_ids,
                scenario_by_transaction=scenario_by_transaction,
            )
        )

        frequency_findings = detect_frequency_anomalies_v2(available, identities=identities)
        rules_frequency.extend(
            _frequency_outcomes(
                bundle=bundle,
                phase=phase,
                month_key=month_key,
                available=available,
                eval_transactions=eval_transactions,
                identities=identities,
                findings=frequency_findings,
                scenario_by_transaction=scenario_by_transaction,
            )
        )

    engines = {
        "historical-v2.2": {
            "tasks": {
                "recurrence": _summarize_task(
                    historical_recurrence,
                    false_positive_weight=false_positive_weight,
                    false_negative_weight=false_negative_weight,
                    max_errors=max_errors,
                    evaluation_unit="recurring_stream_month",
                ),
                "amount_anomaly": _summarize_task(
                    historical_amount,
                    false_positive_weight=false_positive_weight,
                    false_negative_weight=false_negative_weight,
                    max_errors=max_errors,
                    evaluation_unit="transaction",
                ),
            }
        },
        "rules-v2": {
            "tasks": {
                "recurrence": _summarize_task(
                    rules_recurrence,
                    false_positive_weight=false_positive_weight,
                    false_negative_weight=false_negative_weight,
                    max_errors=max_errors,
                    evaluation_unit="recurring_stream_month",
                ),
                "amount_anomaly": _summarize_task(
                    rules_amount,
                    false_positive_weight=false_positive_weight,
                    false_negative_weight=false_negative_weight,
                    max_errors=max_errors,
                    evaluation_unit="transaction",
                ),
                "frequency_anomaly": _summarize_task(
                    rules_frequency,
                    false_positive_weight=false_positive_weight,
                    false_negative_weight=false_negative_weight,
                    max_errors=max_errors,
                    evaluation_unit="canonical_merchant_month",
                ),
            },
            "unscoredSignals": {
                "recurring_payment_missing": {
                    "observedFindingCount": unscored_rule_counts["recurring_payment_missing"],
                    "reason": "The benchmark has recurrence lifecycle data but no explicit user-facing missing-payment labels.",
                },
                "duplicate_subscription": {
                    "observedFindingCount": None,
                    "reason": "duplicate_charge transaction labels are not equivalent to one persistent duplicate-subscription finding.",
                },
            },
        },
    }

    priority_rows: list[dict[str, object]] = []
    for engine_name, engine in engines.items():
        for task_name, task in engine["tasks"].items():
            for row in task["byScenario"]:
                if row["falsePositives"] + row["falseNegatives"] == 0:
                    continue
                priority_rows.append(
                    {
                        "engine": engine_name,
                        "task": task_name,
                        **row,
                    }
                )
    priority_rows.sort(
        key=lambda row: (
            -float(row["weightedErrorCost"]),
            float(row["f1"]),
            str(row["engine"]),
            str(row["task"]),
            str(row["scenario"]),
        )
    )

    splits = bundle.metadata["evaluation"]["splits"]
    return {
        "datasetVersion": bundle.metadata["datasetVersion"],
        "reportVersion": "benchmark-scenario-errors-v3",
        "mode": "development",
        "scope": {
            "phases": list(phases),
            "falsePositiveWeight": false_positive_weight,
            "falseNegativeWeight": false_negative_weight,
            "recurrenceLabelActivity": RECURRENCE_LABEL_ACTIVITY_POLICY,
            "minimumStreamEvidenceOccurrences": MIN_STREAM_EVIDENCE_OCCURRENCES,
            "note": "Scenario metrics are diagnostic synthetic-benchmark evidence, not real-world accuracy claims.",
        },
        "holdout": {
            "status": "sealed",
            "range": splits["holdout"],
            "reason": "Scenario error analysis does not open 2025 H2 during iterative development.",
        },
        "engines": engines,
        "priorityRanking": priority_rows,
    }
