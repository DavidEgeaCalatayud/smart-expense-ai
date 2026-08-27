from __future__ import annotations

from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from sqlalchemy.orm import Session

from app.analysis_contracts import (
    HISTORICAL_ANALYSIS_VERSION,
    UPCOMING_PAYMENTS_VERSION,
)
from app.services.historical_analysis_v2 import _load_expense_transactions
from app.services.merchant_canonicalization import build_merchant_identity_map
from app.services.recurring_streams_v2_2 import build_recurring_profiles_v2_2
from app.upcoming_payments_schemas import UpcomingPaymentItem, UpcomingPaymentsResponse


MONEY_CENT = Decimal("0.01")
EXPECTED_SCORE_THRESHOLD = Decimal("75")
EXPECTED_AMOUNT_STABILITY = Decimal("0.80")
MONTHLY_CADENCES = {"monthly": 1, "quarterly": 3, "yearly": 12}
DAY_CADENCES = {"weekly": 7, "biweekly": 14}


def _money(value: Decimal) -> str:
    return format(value.quantize(MONEY_CENT, rounding=ROUND_HALF_UP), "f")


def _month_index(value: date) -> int:
    return value.year * 12 + value.month - 1


def _month_from_index(value: int) -> tuple[int, int]:
    year, month_index = divmod(value, 12)
    return year, month_index + 1


def _last_day(year: int, month: int) -> int:
    return monthrange(year, month)[1]


def _advance_expected_date(current: date, cadence: str, *, month_end: bool) -> date:
    if cadence in MONTHLY_CADENCES:
        year, month = _month_from_index(_month_index(current) + MONTHLY_CADENCES[cadence])
        day = _last_day(year, month) if month_end else min(current.day, _last_day(year, month))
        return date(year, month, day)
    days = DAY_CADENCES.get(cadence)
    if days is None:
        raise ValueError(f"unsupported recurring cadence: {cadence}")
    return current + timedelta(days=days)


def _future_status(profile: dict[str, object]) -> str:
    if (
        str(profile.get("streamBasis")) == "merchant_price_continuity"
        or int(profile.get("priceRegimeCount", 1)) > 1
    ):
        return "price_changed"
    pattern_score = Decimal(str(profile.get("patternScore", "0")))
    amount_stability = Decimal(str(profile.get("amountStability", "0")))
    if pattern_score >= EXPECTED_SCORE_THRESHOLD and amount_stability >= EXPECTED_AMOUNT_STABILITY:
        return "expected"
    return "likely"


def _expected_amount(profile: dict[str, object]) -> Decimal:
    price_changed = (
        str(profile.get("streamBasis")) == "merchant_price_continuity"
        or int(profile.get("priceRegimeCount", 1)) > 1
    )
    source = profile.get("latestAmount") if price_changed else profile.get("medianAmount")
    return Decimal(str(source or "0"))


def _explanation(profile: dict[str, object], status: str) -> str:
    cadence = str(profile.get("cadence") or "recurring")
    pattern_score = str(profile.get("patternScore") or "0")
    history = int(profile.get("occurrenceCount", 0))
    if status == "price_changed":
        return (
            f"{cadence.title()} recurring stream with {history} observed occurrences. "
            f"The lifecycle engine preserved the stream across {int(profile.get('priceRegimeCount', 1))} "
            "sequential price regimes, so the latest observed amount is projected."
        )
    if status == "overdue":
        return (
            f"The {cadence} schedule is past its grace window with "
            f"{int(profile.get('missedExpectedOccurrences', 0))} missed expected occurrence(s). "
            "It is shown separately and is not included in the future-window total."
        )
    evidence = "strong" if status == "expected" else "qualified"
    return (
        f"{evidence.title()} deterministic recurrence evidence from {history} observed occurrences "
        f"(pattern score {pattern_score}); this score is not a probability."
    )


def _item(
    profile: dict[str, object],
    expected_date: date,
    expected_amount: Decimal,
    status: str,
) -> UpcomingPaymentItem:
    return UpcomingPaymentItem(
        streamKey=str(profile.get("streamKey") or ""),
        merchant=str(profile.get("merchant") or ""),
        canonicalMerchant=str(profile.get("canonicalMerchant") or ""),
        expectedDate=expected_date.isoformat(),
        expectedAmount=_money(expected_amount),
        status=status,  # type: ignore[arg-type]
        cadence=str(profile.get("cadence") or ""),
        patternScore=str(profile.get("patternScore") or "0"),
        amountStability=str(profile.get("amountStability") or "0"),
        historyDepth=str(profile.get("historyDepth") or "0"),
        occurrenceCount=int(profile.get("occurrenceCount", 0)),
        missedExpectedOccurrences=int(profile.get("missedExpectedOccurrences", 0)),
        streamBasis=str(profile.get("streamBasis") or "merchant_default"),
        priceRegimeCount=int(profile.get("priceRegimeCount", 1)),
        lifecycleReactivated=bool(profile.get("lifecycleReactivated", False)),
        explanation=_explanation(profile, status),
    )


def project_upcoming_payments(
    transactions,
    *,
    as_of: date,
    days: int = 30,
) -> UpcomingPaymentsResponse:
    if days < 1 or days > 90:
        raise ValueError("days must be between 1 and 90")
    window_end = as_of + timedelta(days=days - 1)
    eligible = [item for item in transactions if item.transaction_date <= as_of]
    if not eligible:
        return UpcomingPaymentsResponse(
            projectionVersion=UPCOMING_PAYMENTS_VERSION,
            analysisVersion=HISTORICAL_ANALYSIS_VERSION,
            asOf=as_of.isoformat(),
            windowStart=as_of.isoformat(),
            windowEnd=window_end.isoformat(),
            days=days,
            expectedTotal="0.00",
            upcomingCount=0,
            overdueCount=0,
            upcomingPayments=[],
            overduePayments=[],
        )

    identities = build_merchant_identity_map([item.merchant for item in eligible])
    profiles = build_recurring_profiles_v2_2(
        eligible,
        as_of,
        identities,
        limit=None,
    )

    upcoming: list[UpcomingPaymentItem] = []
    overdue: list[UpcomingPaymentItem] = []
    expected_total = Decimal("0")

    for profile in profiles:
        raw_next = profile.get("nextExpectedDate")
        if not raw_next:
            continue
        next_expected = date.fromisoformat(str(raw_next))
        amount = _expected_amount(profile)
        if amount <= Decimal("0"):
            continue

        if next_expected < as_of:
            if bool(profile.get("isExpectedPaymentMissing", False)):
                overdue.append(_item(profile, next_expected, amount, "overdue"))
            # Do not roll a missing/dormant stream forward automatically. A new observed
            # occurrence must re-establish current activity before it contributes to future totals.
            continue

        status = _future_status(profile)
        month_end = Decimal(str(profile.get("monthEndFit", "0"))) >= Decimal("0.60")
        occurrence_date = next_expected
        while occurrence_date <= window_end:
            upcoming.append(_item(profile, occurrence_date, amount, status))
            expected_total += amount
            occurrence_date = _advance_expected_date(
                occurrence_date,
                str(profile.get("cadence") or ""),
                month_end=month_end,
            )

    upcoming.sort(key=lambda item: (item.expectedDate, item.merchant.casefold(), item.streamKey))
    overdue.sort(key=lambda item: (item.expectedDate, item.merchant.casefold(), item.streamKey))
    return UpcomingPaymentsResponse(
        projectionVersion=UPCOMING_PAYMENTS_VERSION,
        analysisVersion=HISTORICAL_ANALYSIS_VERSION,
        asOf=as_of.isoformat(),
        windowStart=as_of.isoformat(),
        windowEnd=window_end.isoformat(),
        days=days,
        expectedTotal=_money(expected_total),
        upcomingCount=len(upcoming),
        overdueCount=len(overdue),
        upcomingPayments=upcoming,
        overduePayments=overdue,
    )


def get_upcoming_payments(
    db: Session,
    user_id: UUID,
    *,
    days: int = 30,
    as_of: date | None = None,
) -> UpcomingPaymentsResponse:
    effective_date = as_of or date.today()
    return project_upcoming_payments(
        _load_expense_transactions(db, user_id),
        as_of=effective_date,
        days=days,
    )
