from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Annotated, Any

from pydantic import BaseModel, EmailStr, Field, PlainSerializer, field_validator


LegacyPositiveMoney = Annotated[
    Decimal,
    Field(gt=Decimal("0"), max_digits=12, decimal_places=2),
    PlainSerializer(lambda value: float(value), return_type=float, when_used="json"),
]
PositiveMoney = Annotated[
    Decimal,
    Field(gt=Decimal("0"), max_digits=12, decimal_places=2),
]
LegacyMoney = Annotated[
    Decimal,
    PlainSerializer(lambda value: float(value), return_type=float, when_used="json"),
]


def _require_decimal_string(value: object) -> object:
    if not isinstance(value, str):
        raise ValueError("amount must be sent as a decimal string")
    return value


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
    amount: LegacyPositiveMoney
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
    totalIncome: LegacyMoney
    totalExpenses: LegacyMoney
    balance: LegacyMoney
    recurringCount: int
    reviewCount: int
    transactionCount: int


class MonthlyExpense(BaseModel):
    month: str
    amount: LegacyMoney


class TransactionCreateV2(TransactionCreate):
    amount: PositiveMoney

    _decimal_string_amount = field_validator("amount", mode="before")(_require_decimal_string)


class TransactionUpdateV2(TransactionUpdate):
    amount: PositiveMoney

    _decimal_string_amount = field_validator("amount", mode="before")(_require_decimal_string)


class TransactionV2(Transaction):
    amount: PositiveMoney


class TransactionPageV2(BaseModel):
    items: list[TransactionV2]
    page: int
    pageSize: int
    total: int
    pages: int


class TransactionSummaryV2(BaseModel):
    totalIncome: Decimal
    totalExpenses: Decimal
    balance: Decimal
    recurringCount: int
    reviewCount: int
    transactionCount: int


class MonthlyExpenseV2(BaseModel):
    month: str
    amount: Decimal


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


class HistoricalMonthlySpend(BaseModel):
    month: str
    amount: str
    isComplete: bool = True
    daysObserved: int | None = None
    daysInMonth: int | None = None


class HistoricalMonthCompleteness(BaseModel):
    strategy: str = "legacy_unknown"
    partialMonth: str | None = None
    completeMonthsUsed: int = 0
    reason: str = "Month completeness metadata is unavailable for this snapshot."


class HistoricalTrend(BaseModel):
    direction: str
    monthlySlope: str
    averageMonthlySpend: str
    rSquared: str
    activeMonths: int
    completeMonthsUsed: int = 0
    excludedPartialMonth: str | None = None


class HistoricalRecurringProfile(BaseModel):
    merchant: str
    canonicalMerchant: str | None = None
    observedMerchants: list[str] = Field(default_factory=list)
    cadence: str
    occurrenceCount: int
    medianAmount: str
    medianIntervalDays: str
    intervalRegularity: str
    dayOfMonthStability: str = "0.000"
    monthEndFit: str = "0.000"
    dayOfWeekStability: str = "0.000"
    amountStability: str
    amountMad: str = "0.00"
    amountCv: str = "0.000"
    cadenceFit: str
    historyDepth: str
    consecutivePeriods: int = 0
    missedExpectedOccurrences: int = 0
    isExpectedPaymentMissing: bool = False
    patternScore: str
    nextExpectedDate: str


class HistoricalOutlier(BaseModel):
    transactionId: str
    merchant: str
    canonicalMerchant: str | None = None
    category: str
    date: str
    amount: str
    baselineScope: str
    baselineCount: int
    baselineMedian: str
    robustSpread: str
    deviationScore: str


class HistoricalCategoryShift(BaseModel):
    category: str
    direction: str
    previousThreeMonthAverage: str
    currentThreeMonthAverage: str
    delta: str
    percentChange: str | None
    comparisonMonths: list[str] = Field(default_factory=list)


class HistoricalCoverage(BaseModel):
    transactionCount: int
    activeMonths: int
    completeMonths: int = 0
    partialMonthsExcluded: int = 0
    canonicalMerchants: int = 0
    merchantsWithBaseline: int
    categoriesWithBaseline: int
    recurringProfiles: int
    outlierCount: int


class HistoricalAnalysisResponse(BaseModel):
    snapshotId: str
    analysisVersion: str
    windowMonths: int
    periodStart: str
    periodEnd: str
    analyzedTransactions: int
    generatedAt: datetime
    monthlySpend: list[HistoricalMonthlySpend]
    monthCompleteness: HistoricalMonthCompleteness = Field(default_factory=HistoricalMonthCompleteness)
    trend: HistoricalTrend
    recurringProfiles: list[HistoricalRecurringProfile]
    outliers: list[HistoricalOutlier]
    categoryShifts: list[HistoricalCategoryShift]
    coverage: HistoricalCoverage
