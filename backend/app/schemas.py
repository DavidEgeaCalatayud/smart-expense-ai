from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, EmailStr, Field


class TransactionType(str, Enum):
    expense = "expense"
    income = "income"


class TransactionStatus(str, Enum):
    normal = "normal"
    review = "review"


class PaymentMethod(str, Enum):
    card = "card"
    cash = "cash"
    bank_transfer = "bank_transfer"
    direct_debit = "direct_debit"


class TransactionSort(str, Enum):
    newest = "newest"
    oldest = "oldest"
    amount_high = "amount_high"
    amount_low = "amount_low"


class FindingType(str, Enum):
    recurring_pattern = "recurring_pattern"
    duplicate_subscription = "duplicate_subscription"
    spending_anomaly = "spending_anomaly"


class FindingSeverity(str, Enum):
    info = "info"
    warning = "warning"
    high = "high"


class FindingStatus(str, Enum):
    open = "open"
    dismissed = "dismissed"
    resolved = "resolved"


class UserResponse(BaseModel):
    id: str
    email: EmailStr
    displayName: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=12, max_length=128)
    displayName: str = Field(..., min_length=1, max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class AuthResponse(BaseModel):
    user: UserResponse


class CategoryResponse(BaseModel):
    id: str
    name: str
    transactionType: TransactionType


class TransactionBase(BaseModel):
    merchant: str = Field(..., min_length=1, max_length=120)
    description: str = Field(default="", max_length=255)
    category: str = Field(..., min_length=1, max_length=80)
    amount: float = Field(..., gt=0)
    date: str = Field(..., min_length=10, max_length=10)
    type: TransactionType
    paymentMethod: PaymentMethod
    isRecurring: bool = False


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(TransactionBase):
    pass


class Transaction(TransactionBase):
    id: str
    status: TransactionStatus


class TransactionPage(BaseModel):
    items: list[Transaction]
    page: int
    pageSize: int
    total: int
    pages: int


class TransactionSummary(BaseModel):
    totalIncome: float
    totalExpenses: float
    balance: float
    recurringCount: int
    reviewCount: int
    transactionCount: int


class MonthlyExpense(BaseModel):
    month: str
    amount: float


class IntelligenceFindingResponse(BaseModel):
    id: str
    type: FindingType
    severity: FindingSeverity
    status: FindingStatus
    title: str
    explanation: str
    evidence: dict[str, Any]
    ruleVersion: str
    firstDetectedAt: datetime
    lastDetectedAt: datetime
    resolvedAt: datetime | None = None


class FindingStatusUpdate(BaseModel):
    status: FindingStatus


class IntelligenceScanResponse(BaseModel):
    scanId: str
    ruleVersion: str
    analyzedTransactions: int
    detectedFindings: int
    scannedAt: datetime


class IntelligenceSummary(BaseModel):
    openCount: int
    recurringCount: int
    duplicateSubscriptionCount: int
    anomalyCount: int
    dismissedCount: int
    resolvedCount: int
    lastScanAt: datetime | None
    analyzedTransactions: int
    ruleVersion: str
