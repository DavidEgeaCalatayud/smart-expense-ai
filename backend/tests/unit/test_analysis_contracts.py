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
    }

    for value in (
        ACTIONABLE_RULES_VERSION,
        HISTORICAL_ANALYSIS_VERSION,
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
    assert AMOUNT_ANOMALY_POLICY in documents["api"]
    assert ACTIONABLE_RULES_VERSION in documents["testing"]
    assert HISTORICAL_ANALYSIS_VERSION in documents["testing"]
    assert HISTORICAL_ANALYSIS_VERSION in documents["architecture"]
    assert ACTIONABLE_RULES_VERSION in documents["architecture"]

    stale_claims = (
        "new runs create `historical-v2.1` snapshots",
        "Merchant baselines use the canonical merchant, with category fallback",
        "otherwise >= 8 earlier category charges",
        "otherwise category fallback after at least 8 earlier charges",
        "category-fallback amount anomalies",
        "category fallback can compare heterogeneous purchases",
        "category history is used only when canonical merchant history is insufficient",
        "chronological robust outliers with merchant/category baselines",
    )
    combined = "\n".join(documents.values())
    for claim in stale_claims:
        assert claim not in combined


def test_repository_metadata_and_primary_docs_reference_project_governance_files() -> None:
    assert (REPO_ROOT / "LICENSE").is_file()
    assert (REPO_ROOT / "CHANGELOG.md").is_file()

    readme = _read("README.md")
    roadmap = _read("ROADMAP.md")
    assert "docs/analysis-contracts.md" in readme
    assert "CHANGELOG.md" in readme
    assert "LICENSE" in readme
    assert "analysis_contracts.py" in roadmap
    assert "CHANGELOG.md" in roadmap
    assert "LICENSE" in roadmap
