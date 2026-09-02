from datetime import datetime
from typing import Literal

from pydantic import BaseModel


PlanTier = Literal["free", "premium"]
SubscriptionStatus = Literal["none", "trialing", "active", "past_due", "canceled"]


class EntitlementLimits(BaseModel):
    maxCsvImportsPerMonth: int
    maxCustomCategories: int
    maxBudgetsPerMonth: int
    maxHistoricalWindowMonths: int
    maxAssistantQueriesPerDay: int


class FeatureEntitlement(BaseModel):
    eligible: bool
    enabled: bool


class EntitlementsResponse(BaseModel):
    policyVersion: str
    enforcementMode: Literal["observe_only"]
    planTier: PlanTier
    subscriptionStatus: SubscriptionStatus
    subscriptionCurrentPeriodEnd: datetime | None
    limits: EntitlementLimits
    features: dict[str, FeatureEntitlement]
