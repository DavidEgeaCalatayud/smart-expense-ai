from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from statistics import median


ZERO = Decimal("0")
MIN_MERCHANT_BASELINE_COUNT = 4
MERCHANT_BASELINE_WINDOW = 12
MIN_AMOUNT_DELTA = Decimal("20.00")
MIN_AMOUNT_RATIO = Decimal("1.50")
MAD_MULTIPLIER = Decimal("3.00")
IQR_EXTREME_MULTIPLIER = Decimal("3.00")
BASELINE_POLICY = "merchant_mad_plus_extreme_iqr_v1"


@dataclass(frozen=True)
class AmountAnomalyDecision:
    is_anomaly: bool
    baseline_median: Decimal
    baseline_count: int
    mad: Decimal
    robust_spread: Decimal
    first_quartile: Decimal
    third_quartile: Decimal
    interquartile_range: Decimal
    distribution_upper_fence: Decimal
    threshold: Decimal
    delta: Decimal
    deviation_score: Decimal
    ratio: Decimal


def _median_decimal(values: list[Decimal]) -> Decimal:
    result = median(values)
    return result if isinstance(result, Decimal) else Decimal(str(result))


def _quartiles(values: list[Decimal]) -> tuple[Decimal, Decimal]:
    ordered = sorted(values)
    midpoint = len(ordered) // 2
    if len(ordered) % 2:
        lower = ordered[:midpoint]
        upper = ordered[midpoint + 1 :]
    else:
        lower = ordered[:midpoint]
        upper = ordered[midpoint:]
    # The caller requires at least four values, so both halves are non-empty.
    return _median_decimal(lower), _median_decimal(upper)


def evaluate_amount_anomaly(
    candidate_amount: Decimal,
    merchant_history: list[Decimal],
) -> AmountAnomalyDecision | None:
    """Evaluate one charge against prior observations of the same canonical merchant.

    Category-only history is intentionally insufficient evidence for a merchant-level amount
    anomaly. The caller must pass only values observed before ``candidate_amount`` so the
    policy remains temporally causal.

    The MAD rule catches sharp changes around the merchant median, while an extreme Tukey
    fence protects legitimate high-variance merchants from being flagged merely because the
    latest observation falls in their normal upper tail. The fence is structural distribution
    evidence rather than a benchmark-calibrated ratio threshold.
    """

    baseline_values = merchant_history[-MERCHANT_BASELINE_WINDOW:]
    if len(baseline_values) < MIN_MERCHANT_BASELINE_COUNT:
        return None

    baseline = _median_decimal(baseline_values)
    if baseline <= ZERO:
        return None

    mad = _median_decimal([abs(value - baseline) for value in baseline_values])
    robust_spread = max(mad, baseline * Decimal("0.05"), Decimal("1.00"))
    first_quartile, third_quartile = _quartiles(baseline_values)
    interquartile_range = max(ZERO, third_quartile - first_quartile)
    distribution_upper_fence = third_quartile + IQR_EXTREME_MULTIPLIER * interquartile_range

    delta = candidate_amount - baseline
    deviation_score = delta / robust_spread
    ratio = candidate_amount / baseline
    threshold = max(
        baseline * MIN_AMOUNT_RATIO,
        baseline + MAD_MULTIPLIER * robust_spread,
        distribution_upper_fence,
    )
    is_anomaly = (
        deviation_score >= MAD_MULTIPLIER
        and delta >= MIN_AMOUNT_DELTA
        and candidate_amount >= threshold
    )
    return AmountAnomalyDecision(
        is_anomaly=is_anomaly,
        baseline_median=baseline,
        baseline_count=len(baseline_values),
        mad=mad,
        robust_spread=robust_spread,
        first_quartile=first_quartile,
        third_quartile=third_quartile,
        interquartile_range=interquartile_range,
        distribution_upper_fence=distribution_upper_fence,
        threshold=threshold,
        delta=delta,
        deviation_score=deviation_score,
        ratio=ratio,
    )


__all__ = [
    "AmountAnomalyDecision",
    "BASELINE_POLICY",
    "IQR_EXTREME_MULTIPLIER",
    "MAD_MULTIPLIER",
    "MERCHANT_BASELINE_WINDOW",
    "MIN_AMOUNT_DELTA",
    "MIN_AMOUNT_RATIO",
    "MIN_MERCHANT_BASELINE_COUNT",
    "evaluate_amount_anomaly",
]
