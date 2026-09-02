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


class PrivacyExportSubscription(BaseModel):
    planTier: str
    subscriptionStatus: str
    subscriptionCurrentPeriodEnd: datetime | None


class PrivacyExportResponseWithImports(PrivacyExportResponse):
    importBatches: list[PrivacyExportImportBatch] = Field(default_factory=list)
    customCategories: list[PrivacyExportCustomCategory] = Field(default_factory=list)
    budgets: list[PrivacyExportBudget] = Field(default_factory=list)
    categorySuggestions: list[PrivacyExportCategorySuggestion] = Field(default_factory=list)
    subscription: PrivacyExportSubscription | None = None
