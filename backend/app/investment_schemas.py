from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


InvestmentMovementType = Literal["contribution", "sale", "transfer_in", "transfer_out", "adjustment"]
InvestmentValueSource = Literal["nav", "cost_fallback"]


def _decimal_string(value: object, field_name: str) -> object:
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be sent as a decimal string")
    return value


def _normalize_isin(value: str) -> str:
    normalized = value.strip().upper()
    if len(normalized) != 12 or not normalized[:2].isalpha() or not normalized[2:].isalnum():
        raise ValueError("ISIN must contain 12 alphanumeric characters and start with two letters")
    return normalized


class InvestmentPositionCreateRequest(BaseModel):
    financialAccountId: UUID
    name: str = Field(..., min_length=1, max_length=160)
    isin: str = Field(..., min_length=12, max_length=12)
    units: Decimal = Field(..., ge=0, max_digits=24, decimal_places=8)
    costTotal: Decimal = Field(..., ge=0, max_digits=14, decimal_places=2)
    currency: Literal["EUR"] = "EUR"

    @field_validator("units", mode="before")
    @classmethod
    def require_units_string(cls, value: object) -> object:
        return _decimal_string(value, "units")

    @field_validator("costTotal", mode="before")
    @classmethod
    def require_cost_string(cls, value: object) -> object:
        return _decimal_string(value, "costTotal")

    @field_validator("isin")
    @classmethod
    def normalize_isin(cls, value: str) -> str:
        return _normalize_isin(value)


class InvestmentHoldingsUpdateRequest(BaseModel):
    units: Decimal = Field(..., ge=0, max_digits=24, decimal_places=8)
    costTotal: Decimal = Field(..., ge=0, max_digits=14, decimal_places=2)
    movementType: InvestmentMovementType = "adjustment"
    occurredAt: datetime | None = None
    note: str | None = Field(default=None, max_length=500)

    @field_validator("units", mode="before")
    @classmethod
    def require_units_string(cls, value: object) -> object:
        return _decimal_string(value, "units")

    @field_validator("costTotal", mode="before")
    @classmethod
    def require_cost_string(cls, value: object) -> object:
        return _decimal_string(value, "costTotal")


class InvestmentMovementResponse(BaseModel):
    id: str
    positionId: str
    movementType: str
    unitsAfter: str
    costTotalAfter: str
    occurredAt: datetime
    note: str | None


class InvestmentPositionResponse(BaseModel):
    id: str
    financialAccountId: str
    name: str
    isin: str
    units: str
    costTotal: str
    currentValue: str
    gainAmount: str
    gainPercent: str | None
    latestNav: str | None
    navDate: date | None
    navProvider: str | None
    navSourceUrl: str | None
    valueSource: InvestmentValueSource
    autoPricingAvailable: bool
    updatedAt: datetime


class InvestmentPortfolioResponse(BaseModel):
    financialAccountId: str
    name: str
    institution: str | None
    totalValue: str
    totalCost: str
    gainAmount: str
    gainPercent: str | None
    latestValuationDate: date | None
    positions: list[InvestmentPositionResponse]


class NavRefreshResult(BaseModel):
    isin: str
    status: Literal["updated", "cached", "unsupported", "failed"]
    nav: str | None = None
    valuationDate: date | None = None
    provider: str | None = None
    message: str | None = None


class NavRefreshResponse(BaseModel):
    results: list[NavRefreshResult]
    refreshedAccounts: int


class InvestmentHistoryPoint(BaseModel):
    date: date
    value: str
    cost: str


class InvestmentPortfolioHistoryResponse(BaseModel):
    financialAccountId: str
    range: Literal["1m", "3m", "1y", "all"]
    points: list[InvestmentHistoryPoint]
