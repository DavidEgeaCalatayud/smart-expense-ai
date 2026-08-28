from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


EvidenceSource = Literal[
    "financial_summary",
    "period_comparison",
    "budget",
    "financial_findings",
    "historical_analysis",
    "transaction_search",
]


class FinancialAssistantQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: str = Field(..., min_length=3, max_length=1200)


class DraftEvidenceReference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: EvidenceSource
    reference: str = Field(..., min_length=1, max_length=160)


class EvidenceReference(DraftEvidenceReference):
    label: str = Field(..., min_length=1, max_length=160)


class FinancialAssistantDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answer: str = Field(..., min_length=1, max_length=5000)
    evidence: list[DraftEvidenceReference] = Field(..., max_length=20)
    limitations: list[str] = Field(..., max_length=20)


class FinancialAssistantResult(BaseModel):
    answer: str
    evidence: list[EvidenceReference]
    limitations: list[str]


class FinancialAssistantAnswer(FinancialAssistantResult):
    requestId: str
