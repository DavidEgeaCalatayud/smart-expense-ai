from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from math import log1p, sqrt
from statistics import median
from typing import Mapping, Sequence

from sklearn.ensemble import IsolationForest

from app.analysis_contracts import (
    ANOMALY_HYBRID_POLICY,
    ISOLATION_FOREST_FEATURE_POLICY,
    ISOLATION_FOREST_VERSION,
)
from app.services.intelligence_rules import TransactionSnapshot
from app.services.merchant_canonicalization import build_merchant_identity_map


MODEL_VERSION = ISOLATION_FOREST_VERSION
FEATURE_POLICY = ISOLATION_FOREST_FEATURE_POLICY
HYBRID_POLICY = ANOMALY_HYBRID_POLICY
RANDOM_STATE = 41
MIN_FIT_SUPPORT = 20


@dataclass(frozen=True)
class CausalAnomalyFeatureRow:
    transaction_id: str
    transaction_date: date
    amount: Decimal
    merchant_key: str
    prior_merchant_count: int
    merchant_median: Decimal
    robust_deviation: Decimal
    days_since_previous: int
    merchant_frequency: Decimal
    current_month_merchant_count: int
    rolling_seven_day_count: int
    prior_amount_cv: Decimal

    def vector(self) -> list[float]:
        """Return bounded numeric features for IsolationForest.

        Raw evidence remains available on the dataclass, while the fitted representation uses
        log transforms for scale-heavy monetary/count fields. Every value is derived only from
        the candidate transaction plus state accumulated strictly before it.
        """

        return [
            log1p(float(self.amount)),
            log1p(float(max(self.merchant_median, Decimal("0")))),
            max(-25.0, min(25.0, float(self.robust_deviation))),
            log1p(float(self.days_since_previous)),
            float(self.merchant_frequency),
            log1p(float(self.current_month_merchant_count)),
            log1p(float(self.rolling_seven_day_count)),
            min(10.0, float(self.prior_amount_cv)),
            log1p(float(self.prior_merchant_count)),
        ]


def _decimal_median(values: Sequence[Decimal]) -> Decimal:
    result = median(values)
    return result if isinstance(result, Decimal) else Decimal(str(result))


def _merchant_key(raw: str) -> str:
    """Canonicalize one descriptor without looking at any other/future descriptor."""

    identity = build_merchant_identity_map([raw])[raw]
    return identity.canonical or identity.normalized


def _prior_cv(values: Sequence[Decimal]) -> Decimal:
    if len(values) < 2:
        return Decimal("0")
    mean = sum(values, Decimal("0")) / Decimal(len(values))
    if mean <= 0:
        return Decimal("0")
    variance = sum(((value - mean) ** 2 for value in values), Decimal("0")) / Decimal(
        len(values)
    )
    return Decimal(str(sqrt(float(variance)))) / mean


def build_causal_feature_rows(
    transactions: Sequence[TransactionSnapshot],
) -> list[CausalAnomalyFeatureRow]:
    """Featureize transactions chronologically with strictly prior merchant state.

    The current transaction amount/date are legitimate inference inputs. Merchant baselines,
    frequency, rolling counts and CV are calculated before the current row is appended to state.
    Ties are resolved by transaction ID so repeated executions are deterministic.
    """

    ordered = sorted(transactions, key=lambda item: (item.transaction_date, item.id))
    merchant_history: dict[str, list[TransactionSnapshot]] = defaultdict(list)
    rows: list[CausalAnomalyFeatureRow] = []

    for global_index, item in enumerate(ordered):
        key = _merchant_key(item.merchant)
        prior = merchant_history[key]
        prior_amounts = [entry.amount for entry in prior]
        prior_count = len(prior)
        merchant_median = _decimal_median(prior_amounts) if prior_amounts else Decimal("0")
        if prior_amounts and merchant_median > 0:
            mad = _decimal_median([abs(value - merchant_median) for value in prior_amounts])
            robust_spread = max(mad, merchant_median * Decimal("0.05"), Decimal("1.00"))
            robust_deviation = (item.amount - merchant_median) / robust_spread
        else:
            robust_deviation = Decimal("0")

        if prior:
            days_since_previous = max(0, (item.transaction_date - prior[-1].transaction_date).days)
            days_since_previous = min(days_since_previous, 365)
        else:
            days_since_previous = 365

        month_prefix = item.transaction_date.strftime("%Y-%m")
        current_month_count = 1 + sum(
            entry.transaction_date.strftime("%Y-%m") == month_prefix for entry in prior
        )
        rolling_start = item.transaction_date - timedelta(days=6)
        rolling_count = 1 + sum(
            rolling_start <= entry.transaction_date <= item.transaction_date for entry in prior
        )
        merchant_frequency = (
            Decimal(prior_count) / Decimal(global_index) if global_index else Decimal("0")
        )

        rows.append(
            CausalAnomalyFeatureRow(
                transaction_id=item.id,
                transaction_date=item.transaction_date,
                amount=item.amount,
                merchant_key=key,
                prior_merchant_count=prior_count,
                merchant_median=merchant_median,
                robust_deviation=robust_deviation,
                days_since_previous=days_since_previous,
                merchant_frequency=merchant_frequency,
                current_month_merchant_count=current_month_count,
                rolling_seven_day_count=rolling_count,
                prior_amount_cv=_prior_cv(prior_amounts),
            )
        )
        prior.append(item)

    return rows


def _binary_metrics(actual: Sequence[bool], predicted: Sequence[bool]) -> dict[str, float | int]:
    if len(actual) != len(predicted):
        raise ValueError("actual and predicted must have identical support")
    support = len(actual)
    tp = sum(a and p for a, p in zip(actual, predicted, strict=True))
    fp = sum((not a) and p for a, p in zip(actual, predicted, strict=True))
    fn = sum(a and (not p) for a, p in zip(actual, predicted, strict=True))
    tn = support - tp - fp - fn
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "support": support,
        "positives": sum(actual),
        "truePositives": tp,
        "falsePositives": fp,
        "falseNegatives": fn,
        "trueNegatives": tn,
        "precision": round(precision, 6),
        "recall": round(recall, 6),
        "f1": round(f1, 6),
        "falsePositivesPer100Transactions": round((fp / support * 100.0) if support else 0.0, 4),
    }


def _calibrate_threshold(scores: Sequence[float], labels: Sequence[bool]) -> float:
    if len(scores) != len(labels) or not scores:
        raise ValueError("calibration requires non-empty aligned scores and labels")
    if not any(labels):
        return max(scores) + 1.0

    candidates = sorted(set(scores))
    best_threshold = candidates[0]
    best_key: tuple[float, float, float, int, float] | None = None
    for threshold in candidates:
        predicted = [score >= threshold for score in scores]
        metrics = _binary_metrics(labels, predicted)
        key = (
            float(metrics["f1"]),
            float(metrics["precision"]),
            float(metrics["recall"]),
            -int(metrics["falsePositives"]),
            threshold,
        )
        if best_key is None or key > best_key:
            best_key = key
            best_threshold = threshold
    return best_threshold


def _range_payload(start: date, end: date) -> dict[str, str]:
    return {"startDate": start.isoformat(), "endDate": end.isoformat()}


def evaluate_isolation_forest_challenger(
    transactions: Sequence[TransactionSnapshot],
    anomaly_labels: Mapping[str, bool],
    *,
    fit_end: date,
    calibration_start: date,
    calibration_end: date,
    evaluation_start: date,
    evaluation_end: date,
    rule_anomaly_ids: set[str],
    random_state: int = RANDOM_STATE,
) -> dict[str, object]:
    """Evaluate rules, IsolationForest and their union on identical causal observations.

    IsolationForest is fitted only on rows at or before ``fit_end``. Labels are used only to
    calibrate the anomaly-score threshold on the calibration window. Evaluation rows never
    affect fitting or threshold selection. The returned report is aggregate-only and contains
    no transaction IDs or merchant strings.
    """

    if not (fit_end < calibration_start <= calibration_end < evaluation_start <= evaluation_end):
        raise ValueError("fit, calibration and evaluation windows must be chronological and disjoint")

    rows = build_causal_feature_rows(transactions)
    fit_rows = [row for row in rows if row.transaction_date <= fit_end]
    calibration_rows = [
        row for row in rows if calibration_start <= row.transaction_date <= calibration_end
    ]
    evaluation_rows = [
        row for row in rows if evaluation_start <= row.transaction_date <= evaluation_end
    ]
    if len(fit_rows) < MIN_FIT_SUPPORT:
        raise ValueError(f"IsolationForest-v1 requires at least {MIN_FIT_SUPPORT} prior fit rows")
    if not calibration_rows or not evaluation_rows:
        raise ValueError("calibration and evaluation windows must contain scored rows")
    missing = [
        row.transaction_id
        for row in calibration_rows + evaluation_rows
        if row.transaction_id not in anomaly_labels
    ]
    if missing:
        raise ValueError("every calibration/evaluation row requires an anomaly label")

    model = IsolationForest(
        n_estimators=160,
        max_samples="auto",
        contamination="auto",
        random_state=random_state,
        n_jobs=1,
    )
    model.fit([row.vector() for row in fit_rows])
    calibration_scores = [
        -float(value)
        for value in model.score_samples([row.vector() for row in calibration_rows])
    ]
    calibration_actual = [anomaly_labels[row.transaction_id] for row in calibration_rows]
    threshold = _calibrate_threshold(calibration_scores, calibration_actual)

    evaluation_scores = [
        -float(value)
        for value in model.score_samples([row.vector() for row in evaluation_rows])
    ]
    actual = [anomaly_labels[row.transaction_id] for row in evaluation_rows]
    ml_predicted = [score >= threshold for score in evaluation_scores]
    rules_predicted = [row.transaction_id in rule_anomaly_ids for row in evaluation_rows]
    hybrid_predicted = [
        rules or ml for rules, ml in zip(rules_predicted, ml_predicted, strict=True)
    ]

    def slices(predicted: Sequence[bool]) -> dict[str, dict[str, float | int]]:
        groups = {
            "coldStart_0_3": [index for index, row in enumerate(evaluation_rows) if row.prior_merchant_count < 4],
            "established_4_11": [index for index, row in enumerate(evaluation_rows) if 4 <= row.prior_merchant_count < 12],
            "deepHistory_12Plus": [index for index, row in enumerate(evaluation_rows) if row.prior_merchant_count >= 12],
        }
        return {
            name: _binary_metrics([actual[index] for index in indexes], [predicted[index] for index in indexes])
            for name, indexes in groups.items()
        }

    rules_metrics = _binary_metrics(actual, rules_predicted)
    ml_metrics = _binary_metrics(actual, ml_predicted)
    hybrid_metrics = _binary_metrics(actual, hybrid_predicted)
    return {
        "evaluationVersion": "anomaly-challenger-evaluation-v1",
        "modelVersion": MODEL_VERSION,
        "featurePolicy": FEATURE_POLICY,
        "hybridPolicy": HYBRID_POLICY,
        "productionEngine": "rules-v2",
        "protocol": {
            "fit": _range_payload(min(row.transaction_date for row in fit_rows), fit_end),
            "calibration": _range_payload(calibration_start, calibration_end),
            "evaluation": _range_payload(evaluation_start, evaluation_end),
            "fitSupport": len(fit_rows),
            "calibrationSupport": len(calibration_rows),
            "evaluationSupport": len(evaluation_rows),
            "threshold": round(threshold, 12),
            "randomState": random_state,
            "finalHoldoutUsedForFit": False,
        },
        "models": {
            "rules-v2": {"metrics": rules_metrics, "historySlices": slices(rules_predicted)},
            MODEL_VERSION: {"metrics": ml_metrics, "historySlices": slices(ml_predicted)},
            HYBRID_POLICY: {"metrics": hybrid_metrics, "historySlices": slices(hybrid_predicted)},
        },
        "promotionDecision": {
            "replaceProductionRules": False,
            "reason": "offline challenger evidence alone cannot replace rules-v2; representative real labelled evidence is required",
        },
    }


__all__ = [
    "CausalAnomalyFeatureRow",
    "FEATURE_POLICY",
    "HYBRID_POLICY",
    "MIN_FIT_SUPPORT",
    "MODEL_VERSION",
    "RANDOM_STATE",
    "build_causal_feature_rows",
    "evaluate_isolation_forest_challenger",
]
