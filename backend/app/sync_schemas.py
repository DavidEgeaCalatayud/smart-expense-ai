from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


SYNC_PROTOCOL_VERSION = "sync-v1"
SyncEntityType = Literal[
    "transaction",
    "category",
    "budget",
    "financial_account",
    "financial_account_snapshot",
]
SyncOperation = Literal["upsert", "delete"]
SyncMutationStatus = Literal["applied", "duplicate", "conflict", "rejected"]

_MONEY_PATTERN = re.compile(r"^-?\d+(?:\.\d{1,2})?$")


def _validate_money_string(value: object, field_name: str, *, positive: bool = False) -> str:
    if not isinstance(value, str) or not _MONEY_PATTERN.fullmatch(value):
        qualifier = "positive " if positive else ""
        raise ValueError(
            f"{field_name} must be a {qualifier}decimal string with at most two decimals"
        )
    try:
        amount = Decimal(value)
    except InvalidOperation as exc:
        raise ValueError(f"{field_name} is not a valid decimal amount") from exc
    if positive and amount <= 0:
        raise ValueError(f"{field_name} must be positive")
    if amount.as_tuple().exponent < -2 or abs(amount) >= Decimal("10000000000"):
        raise ValueError(f"{field_name} is outside the supported NUMERIC(12,2) range")
    return value


def _require_timezone(value: datetime, field_name: str) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{field_name} must include a timezone offset")
    return value


class TransactionSyncPayload(BaseModel):
    merchant: str = Field(..., min_length=1, max_length=120)
    description: str = Field(default="", max_length=255)
    categoryId: UUID
    amount: str
    currency: str = Field(..., min_length=3, max_length=3)
    transactionDate: str
    transactionType: Literal["expense", "income"]
    paymentMethod: Literal["card", "cash", "bank_transfer", "direct_debit"]
    isRecurring: bool
    source: Literal["manual", "import", "bank_api"]

    @field_validator("amount", mode="before")
    @classmethod
    def validate_amount(cls, value: object) -> str:
        return _validate_money_string(value, "amount", positive=True)

    @field_validator("transactionDate")
    @classmethod
    def validate_transaction_date(cls, value: str) -> str:
        try:
            parsed = date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("transactionDate must be an ISO date") from exc
        if parsed.isoformat() != value:
            raise ValueError("transactionDate must use YYYY-MM-DD")
        return value

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        return value.upper()


class CategorySyncPayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    transactionType: Literal["expense", "income"]
    systemCategory: bool
    archived: bool


class BudgetSyncPayload(BaseModel):
    categoryId: UUID | None = None
    month: str
    limitAmount: str

    @field_validator("limitAmount", mode="before")
    @classmethod
    def validate_limit_amount(cls, value: object) -> str:
        return _validate_money_string(value, "limitAmount", positive=True)

    @field_validator("month")
    @classmethod
    def validate_month(cls, value: str) -> str:
        try:
            parsed = date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("month must be an ISO first-of-month date") from exc
        if parsed.isoformat() != value or parsed.day != 1:
            raise ValueError("month must use YYYY-MM-01")
        return value


class FinancialAccountHistoryBaseSyncPayload(BaseModel):
    currentBalance: str
    includeInNetWorth: bool
    archived: bool

    @field_validator("currentBalance", mode="before")
    @classmethod
    def validate_current_balance(cls, value: object) -> str:
        return _validate_money_string(value, "historyBase.currentBalance")


class FinancialAccountBalanceObservationSyncPayload(BaseModel):
    id: UUID
    balance: str
    includeInNetWorth: bool
    archived: bool
    recordedAt: datetime
    source: Literal["manual"] = "manual"

    @field_validator("balance", mode="before")
    @classmethod
    def validate_balance(cls, value: object) -> str:
        return _validate_money_string(value, "balanceObservations.balance")

    @field_validator("recordedAt")
    @classmethod
    def validate_recorded_at(cls, value: datetime) -> datetime:
        return _require_timezone(value, "balanceObservations.recordedAt")


class FinancialAccountSyncPayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    institution: str | None = Field(default=None, max_length=120)
    accountType: Literal["checking", "savings", "broker", "wallet", "cash", "other"]
    purpose: Literal[
        "daily",
        "savings",
        "emergency_fund",
        "opportunities",
        "investment",
        "other",
    ]
    currentBalance: str
    currency: Literal["EUR"]
    includeInNetWorth: bool
    archived: bool
    balanceUpdatedAt: datetime
    balanceSnapshotId: UUID | None = None
    historyBase: FinancialAccountHistoryBaseSyncPayload | None = None
    balanceObservations: list[FinancialAccountBalanceObservationSyncPayload] = Field(
        default_factory=list,
        max_length=1000,
    )

    @field_validator("currentBalance", mode="before")
    @classmethod
    def validate_current_balance(cls, value: object) -> str:
        return _validate_money_string(value, "currentBalance")

    @field_validator("balanceUpdatedAt")
    @classmethod
    def validate_balance_updated_at(cls, value: datetime) -> datetime:
        return _require_timezone(value, "balanceUpdatedAt")

    @model_validator(mode="after")
    def validate_balance_observation_batch(self) -> "FinancialAccountSyncPayload":
        if not self.balanceObservations:
            return self

        ids = [observation.id for observation in self.balanceObservations]
        if len(ids) != len(set(ids)):
            raise ValueError("balanceObservations must use unique ids")

        for previous, current in zip(
            self.balanceObservations,
            self.balanceObservations[1:],
            strict=False,
        ):
            if current.recordedAt < previous.recordedAt:
                raise ValueError("balanceObservations must be ordered by recordedAt")

        last = self.balanceObservations[-1]
        if (
            Decimal(last.balance) != Decimal(self.currentBalance)
            or last.includeInNetWorth != self.includeInNetWorth
            or last.archived != self.archived
        ):
            raise ValueError(
                "the final balance observation must match the final financial-account state"
            )

        final_changed_from_base = self.historyBase is None or (
            Decimal(self.historyBase.currentBalance) != Decimal(self.currentBalance)
            or self.historyBase.includeInNetWorth != self.includeInNetWorth
            or self.historyBase.archived != self.archived
        )
        expected_snapshot_id = last.id if final_changed_from_base else None
        if self.balanceSnapshotId != expected_snapshot_id:
            raise ValueError(
                "balanceSnapshotId must identify the final observation only when the final state differs from historyBase"
            )
        return self


class FinancialAccountSnapshotSyncPayload(BaseModel):
    financialAccountId: UUID
    balance: str
    includeInNetWorth: bool
    archived: bool
    recordedAt: datetime
    source: Literal["manual", "open_banking", "import"]

    @field_validator("balance", mode="before")
    @classmethod
    def validate_balance(cls, value: object) -> str:
        return _validate_money_string(value, "balance")


class SyncMutationRequest(BaseModel):
    mutationId: UUID
    entityId: UUID
    entityType: SyncEntityType
    operation: SyncOperation
    baseVersion: int | None = Field(default=None, ge=1)
    clientOccurredAt: datetime
    payload: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_payload_shape(self) -> "SyncMutationRequest":
        if self.operation == "upsert" and self.payload is None:
            raise ValueError("upsert mutations require payload")
        if self.operation == "delete" and self.payload is not None:
            raise ValueError("delete mutations must not include payload")
        return self


class SyncPushRequest(BaseModel):
    protocolVersion: Literal["sync-v1"]
    deviceId: UUID
    mutations: list[SyncMutationRequest] = Field(..., min_length=1, max_length=100)


class SyncMutationError(BaseModel):
    code: str
    message: str


class SyncMutationResult(BaseModel):
    mutationId: UUID
    entityType: SyncEntityType
    entityId: UUID
    status: SyncMutationStatus
    serverVersion: int | None = None
    error: SyncMutationError | None = None


class SyncConflictResponse(BaseModel):
    mutationId: UUID
    entityType: SyncEntityType
    entityId: UUID
    reason: Literal[
        "stale_version",
        "server_deleted",
        "ownership_or_visibility_changed",
    ]
    serverVersion: int | None
    serverPayload: dict[str, Any] | None


class SyncPushResponse(BaseModel):
    protocolVersion: Literal["sync-v1"] = "sync-v1"
    serverTime: datetime
    results: list[SyncMutationResult]
    conflicts: list[SyncConflictResponse]


class SyncChangeResponse(BaseModel):
    cursor: str
    entityType: SyncEntityType
    entityId: UUID
    operation: SyncOperation
    version: int
    changedAt: datetime
    payload: dict[str, Any] | None


class SyncPullPage(BaseModel):
    protocolVersion: Literal["sync-v1"] = "sync-v1"
    serverTime: datetime
    changes: list[SyncChangeResponse]
    nextCursor: str
    hasMore: bool


class SyncBootstrapPage(BaseModel):
    protocolVersion: Literal["sync-v1"] = "sync-v1"
    serverTime: datetime
    changes: list[SyncChangeResponse]
    snapshotToken: str
    nextPageToken: str | None
    establishedCursor: str | None
