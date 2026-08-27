from __future__ import annotations

from pathlib import Path

from app.analysis_contracts import (
    ACTIONABLE_RULES_VERSION,
    AMOUNT_ANOMALY_POLICY,
    CATEGORY_CLASSIFIER_FEATURE_POLICY,
    CATEGORY_CLASSIFIER_VERSION,
    HISTORICAL_ANALYSIS_VERSION,
    RECURRENCE_SEGMENTATION_STRATEGY,
    RECURRENCE_SEGMENTATION_VERSION,
    UPCOMING_PAYMENTS_VERSION,
)
from app.services.amount_anomaly_baseline import BASELINE_POLICY
from app.services.historical_analysis_v2_2 import ANALYSIS_VERSION
from app.services.intelligence_rules_v2 import RULE_VERSION
from ml.category_classifier import FEATURE_POLICY, MODEL_VERSION


REPO_ROOT = Path(__file__).resolve().parents[3]


def _read(relative_path: str) -> str:
    return (REPO_ROOT / relative_path).read_text(encoding="utf-8")


def test_current_engine_and_model_modules_alias_the_contract_registry() -> None:
    assert RULE_VERSION == ACTIONABLE_RULES_VERSION == "rules-v2"
    assert ANALYSIS_VERSION == HISTORICAL_ANALYSIS_VERSION == "historical-v2.2"
    assert UPCOMING_PAYMENTS_VERSION == "recurring-calendar-v1"
    assert BASELINE_POLICY == AMOUNT_ANOMALY_POLICY == "merchant_mad_plus_extreme_iqr_v1"
    assert MODEL_VERSION == CATEGORY_CLASSIFIER_VERSION == "tfidf-logreg-v1"
    assert FEATURE_POLICY == CATEGORY_CLASSIFIER_FEATURE_POLICY == "merchant_descriptor_only_v1"
    assert RECURRENCE_SEGMENTATION_VERSION == "lifecycle-v1"
    assert RECURRENCE_SEGMENTATION_STRATEGY == (
        "canonical_merchant_then_lifecycle_then_price_continuity_then_descriptor_amount_then_temporal_phase"
    )


def test_current_technical_documentation_matches_contract_registry() -> None:
    documents = {
        "contracts": _read("docs/analysis-contracts.md"),
        "historical": _read("docs/historical-analysis.md"),
        "intelligence": _read("docs/intelligence.md"),
        "api": _read("docs/api.md"),
        "testing": _read("docs/testing.md"),
        "architecture": _read("docs/ARCHITECTURE.md"),
        "data_model": _read("docs/DATA_MODEL.md"),
        "product": _read("docs/PRODUCT_SPEC.md"),
        "classifier": _read("ai/category-classifier/README.md"),
        "private_evaluation": _read("docs/private-evaluation.md"),
        "evaluation_protocol": _read("docs/evaluation-protocol.md"),
        "upcoming_payments": _read("docs/upcoming-payments.md"),
    }

    for value in (
        ACTIONABLE_RULES_VERSION,
        HISTORICAL_ANALYSIS_VERSION,
        UPCOMING_PAYMENTS_VERSION,
        AMOUNT_ANOMALY_POLICY,
        RECURRENCE_SEGMENTATION_VERSION,
        CATEGORY_CLASSIFIER_VERSION,
        CATEGORY_CLASSIFIER_FEATURE_POLICY,
    ):
        assert value in documents["contracts"]

    assert HISTORICAL_ANALYSIS_VERSION in documents["historical"]
    assert RECURRENCE_SEGMENTATION_VERSION in documents["historical"]
    assert AMOUNT_ANOMALY_POLICY in documents["historical"]
    assert ACTIONABLE_RULES_VERSION in documents["intelligence"]
    assert AMOUNT_ANOMALY_POLICY in documents["intelligence"]
    assert HISTORICAL_ANALYSIS_VERSION in documents["api"]
    assert UPCOMING_PAYMENTS_VERSION in documents["api"]
    assert "upcoming-payments" in documents["api"]
    assert AMOUNT_ANOMALY_POLICY in documents["api"]
    assert CATEGORY_CLASSIFIER_VERSION in documents["api"]
    assert "category-suggestions/preview" in documents["api"]
    assert "categorySuggestions" in documents["api"]
    assert ACTIONABLE_RULES_VERSION in documents["testing"]
    assert HISTORICAL_ANALYSIS_VERSION in documents["testing"]
    assert UPCOMING_PAYMENTS_VERSION in documents["testing"]
    assert "merchant-group" in documents["testing"]
    assert "private-real-data-v1" in documents["testing"]
    assert HISTORICAL_ANALYSIS_VERSION in documents["architecture"]
    assert ACTIONABLE_RULES_VERSION in documents["architecture"]
    assert UPCOMING_PAYMENTS_VERSION in documents["architecture"]
    assert "category suggestion" in documents["architecture"].lower()
    assert "private-real-data-v1" in documents["architecture"]
    assert "category_suggestions" in documents["data_model"]
    assert "budgets" in documents["data_model"]
    assert ACTIONABLE_RULES_VERSION in documents["product"]
    assert HISTORICAL_ANALYSIS_VERSION in documents["product"]
    assert UPCOMING_PAYMENTS_VERSION in documents["product"]
    assert "user-controlled category suggestions" in documents["product"].lower()
    assert "private-real-data-v1" in documents["product"]
    assert "productConfidenceEnabled=false" in documents["classifier"]
    assert "private-real-data-v1" in documents["classifier"]
    assert "private-real-data-v1" in documents["private_evaluation"]
    assert "aggregate-only" in documents["private_evaluation"].lower()
    assert "private-real-data-v1" in documents["evaluation_protocol"]
    assert "holdout" in documents["evaluation_protocol"].lower()
    assert UPCOMING_PAYMENTS_VERSION in documents["upcoming_payments"]
    assert "overdue" in documents["upcoming_payments"].lower()

    stale_claims = (
        "new runs create `historical-v2.1` snapshots",
        "Merchant baselines use the canonical merchant, with category fallback",
        "otherwise >= 8 earlier category charges",
        "otherwise category fallback after at least 8 earlier charges",
        "category-fallback amount anomalies",
        "category fallback can compare heterogeneous purchases",
        "category history is used only when canonical merchant history is insufficient",
        "chronological robust outliers with merchant/category baselines",
        "currently an offline evaluated model",
        "offline evaluated model and is **not** loaded",
        "offline category classifier boundary",
        "custom user-managed category crud is not implemented yet",
        "the offline `tfidf-logreg-v1` category classifier",
        "recurring-payment calendar / upcoming-payment product view",
    )
    combined = "\n".join(documents.values()).lower()
    for claim in stale_claims:
        assert claim.lower() not in combined

    assert "Suggested fields" not in documents["data_model"]
    assert "Simple prediction based on historical average" not in documents["product"]


def test_repository_metadata_and_primary_docs_reference_project_governance_files() -> None:
    assert (REPO_ROOT / "LICENSE").is_file()
    assert (REPO_ROOT / "CHANGELOG.md").is_file()

    readme = _read("README.md")
    roadmap = _read("ROADMAP.md")
    assert "docs/analysis-contracts.md" in readme
    assert "docs/private-evaluation.md" in readme
    assert "docs/upcoming-payments.md" in readme
    assert "CHANGELOG.md" in readme
    assert "LICENSE" in readme
    assert "category-suggestions/preview" in readme
    assert "productConfidenceEnabled=false" in readme
    assert "private-real-data-v1" in readme
    assert UPCOMING_PAYMENTS_VERSION in readme
    assert "analysis_contracts.py" in roadmap
    assert "category-suggestion feedback" in roadmap
    assert "private-real-data-v1" in roadmap
    assert UPCOMING_PAYMENTS_VERSION in roadmap
    assert "CHANGELOG.md" in roadmap
    assert "LICENSE" in roadmap
