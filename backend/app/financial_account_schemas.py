from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


FinancialAccountType = Literal["checking", "savings", "broker", "wallet", "cash", "other"]
FinancialAccountPurpose = Literal[
    "daily",
    "savings",
    "emergency_fund",
    "opportunities",
    "investment",
    "other",
]


class _ExactMoneyRequest(BaseModel):
    @staticmethod
    def _require_decimal_string(value: object) -> object:
        if not isinstance(value, str):
            raise ValueError("Money values must be sent as decimal strings")
        return value


class FinancialAccountCreateRequest(_ExactMoneyRequest):
    name: str = Field(..., min_length=1, max_length=120)
    institution: str | None = Field(default=None, max_length=120)
    accountType: FinancialAccountType
    purpose: FinancialAccountPurpose
    currentBalance: Decimal = Field(..., max_digits=12, decimal_places=2)
    currency: Literal["EUR"] = "EUR"
    includeInNetWorth: bool = True

    @field_validator("currentBalance", mode="before")
    @classmethod
    def require_current_balance_string(cls, value: object) -> object:
        return cls._require_decimal_string(value)


class FinancialAccountUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    institution: str | None = Field(default=None, max_length=120)
    accountType: FinancialAccountType | None = None
    purpose: FinancialAccountPurpose | None = None
    includeInNetWorth: bool | None = None
    archived: bool | None = None

    @model_validator(mode="after")
    def reject_null_required_updates(self) -> "FinancialAccountUpdateRequest":
        nullable_only = {"institution"}
        for field_name in self.model_fields_set:
            if field_name not in nullable_only and getattr(self, field_name) is None:
                raise ValueError(f"{field_name} cannot be null")
        return self


class FinancialAccountBalanceRequest(_ExactMoneyRequest):
    balance: Decimal = Field(..., max_digits=12, decimal_places=2)

    @field_validator("balance", mode="before")
    @classmethod
    def require_balance_string(cls, value: object) -> object:
        return cls._require_decimal_string(value)


class FinancialAccountResponse(BaseModel):
    id: str
    name: str
    institution: str | None
    accountType: FinancialAccountType
    purpose: FinancialAccountPurpose
    currentBalance: str
    currency: str
    includeInNetWorth: bool
    archived: bool
    balanceUpdatedAt: datetime
    createdAt: datetime
    updatedAt: datetime


class FinancialAccountBalanceSnapshotResponse(BaseModel):
    id: str
    financialAccountId: str
    balance: str
    recordedAt: datetime
    source: str


class NetWorthSummaryResponse(BaseModel):
    totalNetWorth: str
    available: str
    reserved: str
    invested: str
    daily: str
    savings: str
    emergencyFund: str
    opportunities: str
    investment: str
    other: str
    currency: str


class NetWorthHistoryPoint(BaseModel):
    recordedAt: datetime
    totalNetWorth: str


class NetWorthHistoryResponse(BaseModel):
    months: int
    points: list[NetWorthHistoryPoint]
    changeAmount: str
    changePercent: str | None
    currency: str
