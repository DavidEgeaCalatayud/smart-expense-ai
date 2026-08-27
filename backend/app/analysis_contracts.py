"""Canonical identifiers for versioned analysis/model contracts.

This module is the code-level source of truth for identifiers that cross service,
API, benchmark and documentation boundaries. Algorithm-specific numeric thresholds
remain with their owning implementation; stable public/version identifiers live here
so they cannot silently diverge between engines.
"""

ACTIONABLE_RULES_VERSION = "rules-v2"
HISTORICAL_ANALYSIS_VERSION = "historical-v2.2"
UPCOMING_PAYMENTS_VERSION = "recurring-calendar-v1"
SPENDING_FORECAST_VERSION = "spending-forecast-v1"

AMOUNT_ANOMALY_POLICY = "merchant_mad_plus_extreme_iqr_v1"

RECURRENCE_SEGMENTATION_STRATEGY = (
    "canonical_merchant_then_lifecycle_then_price_continuity_then_descriptor_amount_then_temporal_phase"
)
RECURRENCE_SEGMENTATION_VERSION = "lifecycle-v1"

CATEGORY_CLASSIFIER_VERSION = "tfidf-logreg-v1"
CATEGORY_CLASSIFIER_FEATURE_POLICY = "merchant_descriptor_only_v1"


__all__ = [
    "ACTIONABLE_RULES_VERSION",
    "AMOUNT_ANOMALY_POLICY",
    "CATEGORY_CLASSIFIER_FEATURE_POLICY",
    "CATEGORY_CLASSIFIER_VERSION",
    "HISTORICAL_ANALYSIS_VERSION",
    "RECURRENCE_SEGMENTATION_STRATEGY",
    "RECURRENCE_SEGMENTATION_VERSION",
    "SPENDING_FORECAST_VERSION",
    "UPCOMING_PAYMENTS_VERSION",
]
