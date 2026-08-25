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


class HistoricalRecurringProfileV22(HistoricalRecurringProfileV21):
    streamBasis: str = "legacy"
    streamCalendar: str | None = None
    sourceStreamCount: int = 1
    canonicalVariantCount: int = 1
    priceRegimeCount: int = 1


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


class HistoricalCoverageV22(HistoricalCoverageV21):
    temporalPhaseStreams: int = 0
    priceContinuityStreams: int = 0


class HistoricalRecurrenceSegmentation(BaseModel):
    strategy: str = "legacy_merchant_wide"
    analysisVersion: str = "historical-v2"
    profileCount: int = 0


class HistoricalRecurrenceSegmentationV22(HistoricalRecurrenceSegmentation):
    strategyVersion: str = "legacy"
    temporalPhaseProfileCount: int = 0
    priceContinuityProfileCount: int = 0
    ambiguityPolicy: str = "legacy"
    cadencePolicy: str = "legacy"
    minimumParentShortCadenceFit: str = "0.00"
    minimumParentWeekdayStability: str = "0.00"
    amountOnlyPolicy: str = "legacy"
    minimumAmountOnlyConsecutivePeriods: int = 0
    minimumAmountOnlyCalendarStability: str = "0"
    minimumAmountOnlyEarlyConsecutivePeriods: int = 0
    minimumAmountOnlyEarlyCalendarStability: str = "0"
    priceContinuityPolicy: str = "disabled"
    minimumQualifiedMerchantRootTokens: int = 0
    minimumPriceContinuityOccurrences: int = 0
    minimumPriceContinuityCadenceFit: str = "0"
    minimumPriceContinuityCalendarStability: str = "0"
    maximumPriceContinuityRegimes: int = 0
    maximumPriceContinuityChangeRatio: str = "0"
    maximumPriceContinuityPeriodGapMultiplier: int = 0
    recurringScoreThreshold: str = "55"


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


class HistoricalAnalysisResponseV22(BaseModel):
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
    recurringProfiles: list[HistoricalRecurringProfileV22]
    recurrenceSegmentation: HistoricalRecurrenceSegmentationV22 = Field(
        default_factory=HistoricalRecurrenceSegmentationV22
    )
    outliers: list[HistoricalOutlier]
    categoryShifts: list[HistoricalCategoryShift]
    coverage: HistoricalCoverageV22
