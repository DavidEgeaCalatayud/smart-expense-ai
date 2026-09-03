from dataclasses import dataclass

from app.entitlement_schemas import (
    EntitlementLimits,
    EntitlementsResponse,
    FeatureEntitlement,
    PlanTier,
)
from app.models.user import User


POLICY_VERSION = "premium-entitlements-v1"
ENFORCEMENT_MODE = "observe_only"

# Phase 6A deliberately exposes limits without enforcing them. Existing users keep
# all current product behavior until a later, explicit quota-enforcement milestone.
PLAN_LIMITS: dict[PlanTier, EntitlementLimits] = {
    "free": EntitlementLimits(
        maxCsvImportsPerMonth=5,
        maxCustomCategories=25,
        maxBudgetsPerMonth=25,
        maxHistoricalWindowMonths=12,
        maxAssistantQueriesPerDay=20,
    ),
    "premium": EntitlementLimits(
        maxCsvImportsPerMonth=100,
        maxCustomCategories=250,
        maxBudgetsPerMonth=250,
        maxHistoricalWindowMonths=60,
        maxAssistantQueriesPerDay=200,
    ),
}


@dataclass(frozen=True)
class FeaturePolicy:
    premium_only: bool
    released: bool


FEATURE_POLICIES: dict[str, FeaturePolicy] = {
    "advancedInsights": FeaturePolicy(premium_only=True, released=False),
    "exportableReports": FeaturePolicy(premium_only=True, released=True),
}


def _plan_tier(user: User) -> PlanTier:
    # The database constraint guarantees these values in PostgreSQL. Keeping the
    # fallback makes the entitlement boundary fail-safe for fixtures or old local
    # objects created outside a migrated database.
    return "premium" if user.plan_tier == "premium" else "free"


def build_entitlements(user: User) -> EntitlementsResponse:
    plan_tier = _plan_tier(user)
    features: dict[str, FeatureEntitlement] = {}

    for name, policy in FEATURE_POLICIES.items():
        eligible = not policy.premium_only or plan_tier == "premium"
        features[name] = FeatureEntitlement(
            eligible=eligible,
            enabled=eligible and policy.released,
        )

    return EntitlementsResponse(
        policyVersion=POLICY_VERSION,
        enforcementMode=ENFORCEMENT_MODE,
        planTier=plan_tier,
        subscriptionStatus=user.subscription_status,
        subscriptionCurrentPeriodEnd=user.subscription_current_period_end,
        limits=PLAN_LIMITS[plan_tier],
        features=features,
    )
