from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas import PrivacyExportResponse


class PrivacyExportImportBatch(BaseModel):
    id: str
    filename: str
    fileHash: str
    rowsTotal: int
    rowsImported: int
    duplicatesSkipped: int
    invalidRows: int
    createdAt: datetime


class PrivacyExportCustomCategory(BaseModel):
    id: str
    name: str
    transactionType: str
    archived: bool
    createdAt: datetime


class PrivacyExportBudget(BaseModel):
    id: str
    month: str
    categoryId: str | None
    categoryName: str | None
    limitAmount: str
    createdAt: datetime
    updatedAt: datetime


class PrivacyExportCategorySuggestion(BaseModel):
    id: str
    transactionId: str
    merchantKey: str
    transactionType: str
    source: str
    modelVersion: str
    featurePolicy: str
    suggestedCategoryId: str | None
    selectedCategoryId: str | None
    accepted: bool
    correctedAt: datetime | None
    createdAt: datetime
    updatedAt: datetime


class PrivacyExportFinancialAccount(BaseModel):
    id: str
    name: str
    institution: str | None
    accountType: str
    purpose: str
    currentBalance: str
    currency: str
    includeInNetWorth: bool
    archived: bool
    balanceUpdatedAt: datetime
    createdAt: datetime
    updatedAt: datetime


class PrivacyExportFinancialAccountBalanceSnapshot(BaseModel):
    id: str
    financialAccountId: str
    balance: str
    includeInNetWorth: bool
    archived: bool
    recordedAt: datetime
    source: str


class PrivacyExportInvestmentPosition(BaseModel):
    id: str
    financialAccountId: str
    name: str
    isin: str
    units: str
    costTotal: str
    currency: str
    archived: bool
    createdAt: datetime
    updatedAt: datetime


class PrivacyExportInvestmentPositionMovement(BaseModel):
    id: str
    positionId: str
    movementType: str
    unitsAfter: str
    costTotalAfter: str
    occurredAt: datetime
    note: str | None
    createdAt: datetime


class PrivacyExportSubscription(BaseModel):
    planTier: str
    subscriptionStatus: str
    subscriptionCurrentPeriodEnd: datetime | None


class PrivacyExportResponseWithImports(PrivacyExportResponse):
    importBatches: list[PrivacyExportImportBatch] = Field(default_factory=list)
    customCategories: list[PrivacyExportCustomCategory] = Field(default_factory=list)
    budgets: list[PrivacyExportBudget] = Field(default_factory=list)
    categorySuggestions: list[PrivacyExportCategorySuggestion] = Field(default_factory=list)
    financialAccounts: list[PrivacyExportFinancialAccount] = Field(default_factory=list)
    financialAccountBalanceSnapshots: list[PrivacyExportFinancialAccountBalanceSnapshot] = Field(
        default_factory=list
    )
    investmentPositions: list[PrivacyExportInvestmentPosition] = Field(default_factory=list)
    investmentPositionMovements: list[PrivacyExportInvestmentPositionMovement] = Field(
        default_factory=list
    )
    subscription: PrivacyExportSubscription | None = None
