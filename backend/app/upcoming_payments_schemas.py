from typing import Literal

from pydantic import BaseModel


UpcomingPaymentStatus = Literal["expected", "likely", "price_changed", "overdue"]


class UpcomingPaymentItem(BaseModel):
    streamKey: str
    merchant: str
    canonicalMerchant: str
    expectedDate: str
    expectedAmount: str
    status: UpcomingPaymentStatus
    cadence: str
    patternScore: str
    amountStability: str
    historyDepth: str
    occurrenceCount: int
    missedExpectedOccurrences: int
    streamBasis: str
    priceRegimeCount: int
    lifecycleReactivated: bool
    explanation: str


class UpcomingPaymentsResponse(BaseModel):
    projectionVersion: str
    analysisVersion: str
    asOf: str
    windowStart: str
    windowEnd: str
    days: int
    expectedTotal: str
    upcomingCount: int
    overdueCount: int
    upcomingPayments: list[UpcomingPaymentItem]
    overduePayments: list[UpcomingPaymentItem]
