from typing import Literal

from pydantic import BaseModel, ConfigDict


InsightKind = Literal[
    "budget_pressure",
    "open_findings",
    "cash_flow",
    "expense_change",
    "category_concentration",
]
InsightPriority = Literal["attention", "positive", "info"]
MetricFormat = Literal["currency", "percent", "count", "text"]


class AdvancedInsightMetric(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str
    label: str
    value: str
    format: MetricFormat


class AdvancedInsightEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: str
    reference: str
    metrics: list[AdvancedInsightMetric]


class AdvancedInsightCard(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    kind: InsightKind
    priority: InsightPriority
    title: str
    summary: str
    evidence: list[AdvancedInsightEvidence]


class AdvancedInsightsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    insightVersion: Literal["advanced-financial-insights-v1"]
    month: str
    currency: Literal["EUR"]
    insights: list[AdvancedInsightCard]
    sourceContracts: dict[str, str]
    limitations: list[str]
