from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas import (
    HistoricalCategoryShift,
    HistoricalMonthCompleteness,
    HistoricalMonthlySpend,
    HistoricalOutlier,
    HistoricalTrend,
)


class HistoricalRecurringProfileV21(BaseModel):
    streamKey: str | None = None
    streamDescriptor: str | None = None
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


class HistoricalCoverageV21(BaseModel):
    transactionCount: int
    activeMonths: int
    completeMonths: int = 0
    partialMonthsExcluded: int = 0
    canonicalMerchants: int = 0
    merchantsWithBaseline: int
    categoriesWithBaseline: int
    recurringProfiles: int
    recurringStreams: int = 0
    outlierCount: int


class HistoricalRecurrenceSegmentation(BaseModel):
    strategy: str = "legacy_merchant_wide"
    analysisVersion: str = "historical-v2"
    profileCount: int = 0


class HistoricalAnalysisResponseV21(BaseModel):
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
    recurringProfiles: list[HistoricalRecurringProfileV21]
    recurrenceSegmentation: HistoricalRecurrenceSegmentation = Field(
        default_factory=HistoricalRecurrenceSegmentation
    )
    outliers: list[HistoricalOutlier]
    categoryShifts: list[HistoricalCategoryShift]
    coverage: HistoricalCoverageV21
