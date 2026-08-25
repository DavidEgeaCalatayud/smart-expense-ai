from __future__ import annotations

from copy import deepcopy
from typing import Any

from app.services.evaluation_confidence import (
    BootstrapConfig,
    bootstrap_binary_fold_metrics,
    bootstrap_occurrence_fold_metrics,
)
from app.services.historical_evaluation import evaluate_historical_dataset
from app.services.historical_evaluation_protocol import (
    DEFAULT_PARAMETER_SET_ID,
    DEFAULT_RECURRING_THRESHOLD,
    EvaluationParameters,
    TemporalSplit,
    parse_evaluation_protocol,
)


DEVELOPMENT_MODE = "development"
HOLDOUT_MODE = "holdout"


def _month_key(raw_date: str) -> str:
    return str(raw_date)[:7]


def _scoped_payload(payload: dict[str, Any], split: TemporalSplit) -> dict[str, Any]:
    """Return a chronological dataset ending at the split boundary.

    The underlying walk-forward evaluator derives its start from minimumHistoryMonths. We
    therefore keep every historical transaction up to split end and set the history count to
    the number of observed months strictly before split start. Future split/holdout rows are
    physically absent from the scoped payload.
    """

    scoped = deepcopy(payload)
    transactions = [
        item for item in payload.get("transactions", [])
        if _month_key(str(item["date"])) <= split.end_month
    ]
    scoped["transactions"] = transactions
    prior_months = sorted(
        {
            _month_key(str(item["date"]))
            for item in transactions
            if _month_key(str(item["date"])) < split.start_month
        }
    )
    evaluation = dict(scoped.get("evaluation", {}))
    evaluation["minimumHistoryMonths"] = len(prior_months)
    configured_occurrence_months = evaluation.get("occurrenceEvaluationMonths")
    if isinstance(configured_occurrence_months, list):
        evaluation["occurrenceEvaluationMonths"] = [
            str(month)
            for month in configured_occurrence_months
            if split.start_month <= str(month) <= split.end_month
        ]
    evaluation.pop("splits", None)
    scoped["evaluation"] = evaluation
    return scoped


def _attach_confidence(report: dict[str, Any], config: BootstrapConfig) -> dict[str, Any]:
    enriched = deepcopy(report)
    folds = [item for item in enriched.get("folds", []) if isinstance(item, dict)]
    aggregate = enriched.setdefault("aggregate", {})

    recurrence = aggregate.get("recurrence")
    if isinstance(recurrence, dict):
        confidence = bootstrap_binary_fold_metrics(folds, "recurrence", config)
        recurrence["support"] = confidence["support"]
        recurrence["confidence"] = confidence

    anomalies = aggregate.get("anomalies")
    if isinstance(anomalies, dict):
        confidence = bootstrap_binary_fold_metrics(folds, "anomalies", config)
        anomalies["support"] = confidence["support"]
        anomalies["confidence"] = confidence

    occurrences = aggregate.get("occurrences")
    if isinstance(occurrences, dict):
        confidence = bootstrap_occurrence_fold_metrics(folds, config)
        occurrences["support"] = confidence["support"]
        occurrences["confidence"] = confidence

    enriched["confidenceMethod"] = {
        "method": "month_block_percentile_bootstrap_v1",
        "level": config.level,
        "iterations": config.iterations,
        "seed": config.seed,
        "unit": "evaluation_month",
    }
    return enriched


def _run_split(
    payload: dict[str, Any],
    split: TemporalSplit,
    config: BootstrapConfig,
) -> dict[str, Any]:
    report = evaluate_historical_dataset(_scoped_payload(payload, split))
    report = _attach_confidence(report, config)
    report["split"] = split.name
    report["splitRange"] = split.as_dict()
    return report


def run_development_evaluation(
    payload: dict[str, Any],
    *,
    bootstrap: BootstrapConfig | None = None,
) -> dict[str, Any]:
    """Evaluate calibration and validation while keeping holdout inaccessible."""

    protocol = parse_evaluation_protocol(payload)
    if protocol is None:
        raise ValueError("development evaluation requires evaluation.splits")
    config = bootstrap or BootstrapConfig()
    config.validate()

    parameters = EvaluationParameters(
        parameter_set_id=DEFAULT_PARAMETER_SET_ID,
        recurring_score_threshold=DEFAULT_RECURRING_THRESHOLD,
    )
    calibration = _run_split(payload, protocol.calibration, config)
    validation = _run_split(payload, protocol.validation, config)

    return {
        "mode": DEVELOPMENT_MODE,
        "datasetVersion": payload.get("datasetVersion", "unknown"),
        "analysisVersion": "historical-v2.2",
        "protocol": protocol.as_dict(),
        "parameterSelection": {
            "status": "frozen_default_until_labelled_calibration_is_large_enough",
            "selectionData": "calibration_only",
            "validationRole": "design_check_not_parameter_selection",
            "candidateGrid": [
                format(value, "f") for value in protocol.recurring_threshold_candidates
            ],
        },
        "frozenParameters": parameters.as_frozen_dict(),
        "calibration": calibration,
        "validation": validation,
        "holdout": {
            "status": "sealed",
            "range": protocol.holdout.as_dict(),
            "reason": "Holdout metrics are intentionally unavailable in development mode.",
        },
    }


def run_holdout_evaluation(
    payload: dict[str, Any],
    parameters: EvaluationParameters,
    *,
    bootstrap: BootstrapConfig | None = None,
) -> dict[str, Any]:
    """Open the final holdout only with a previously frozen parameter set."""

    protocol = parse_evaluation_protocol(payload)
    if protocol is None:
        raise ValueError("holdout evaluation requires evaluation.splits")
    if parameters.analysis_version != "historical-v2.2":
        raise ValueError("frozen parameter set analysisVersion must be historical-v2.2")
    # The current low-level evaluator executes production historical-v2.2 defaults. Refuse a
    # different threshold until every evaluation call path accepts explicit parameters; this
    # prevents a parameter file from claiming a setting that the holdout run did not execute.
    if parameters.recurring_score_threshold != DEFAULT_RECURRING_THRESHOLD:
        raise ValueError(
            "holdout runner currently supports only the executed historical-v2.2 default threshold"
        )

    config = bootstrap or BootstrapConfig()
    config.validate()
    holdout = _run_split(payload, protocol.holdout, config)
    return {
        "mode": HOLDOUT_MODE,
        "datasetVersion": payload.get("datasetVersion", "unknown"),
        "analysisVersion": "historical-v2.2",
        "protocolVersion": protocol.as_dict()["version"],
        "frozenParameters": parameters.as_frozen_dict(),
        "holdout": holdout,
    }
