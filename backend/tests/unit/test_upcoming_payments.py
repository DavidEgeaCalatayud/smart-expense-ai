from datetime import date
from decimal import Decimal

from app.analysis_contracts import UPCOMING_PAYMENTS_VERSION
from app.services.intelligence_rules import TransactionSnapshot
from app.services.upcoming_payments import (
    _expected_amount,
    _future_status,
    project_upcoming_payments,
)


def _tx(identifier: str, merchant: str, amount: str, value: date) -> TransactionSnapshot:
    return TransactionSnapshot(
        id=identifier,
        merchant=merchant,
        amount=Decimal(amount),
        transaction_date=value,
        category="Subscriptions",
    )


def test_projects_month_end_recurring_charges_without_date_drift() -> None:
    transactions = [
        _tx("s1", "Spotify Premium", "10.99", date(2026, 1, 31)),
        _tx("s2", "Spotify Premium", "10.99", date(2026, 2, 28)),
        _tx("s3", "Spotify Premium", "10.99", date(2026, 3, 31)),
        _tx("s4", "Spotify Premium", "10.99", date(2026, 4, 30)),
    ]

    report = project_upcoming_payments(
        transactions,
        as_of=date(2026, 5, 1),
        days=61,
    )

    assert report.projectionVersion == UPCOMING_PAYMENTS_VERSION
    assert [item.expectedDate for item in report.upcomingPayments] == [
        "2026-05-31",
        "2026-06-30",
    ]
    assert report.expectedTotal == "21.98"
    assert all(item.status == "expected" for item in report.upcomingPayments)
    assert report.overduePayments == []


def test_overdue_stream_is_separate_and_does_not_roll_forward_into_future_total() -> None:
    transactions = [
        _tx("g1", "Example Gym Membership", "29.99", date(2025, 12, 3)),
        _tx("g2", "Example Gym Membership", "29.99", date(2026, 1, 3)),
        _tx("g3", "Example Gym Membership", "29.99", date(2026, 2, 3)),
        _tx("g4", "Example Gym Membership", "29.99", date(2026, 3, 3)),
    ]

    report = project_upcoming_payments(
        transactions,
        as_of=date(2026, 5, 10),
        days=30,
    )

    assert report.expectedTotal == "0.00"
    assert report.upcomingPayments == []
    assert report.overdueCount == 1
    overdue = report.overduePayments[0]
    assert overdue.status == "overdue"
    assert overdue.expectedDate == "2026-04-03"
    assert overdue.missedExpectedOccurrences >= 1


def test_price_changed_projection_uses_latest_observed_price_regime() -> None:
    profile = {
        "streamBasis": "merchant_price_continuity",
        "priceRegimeCount": 2,
        "patternScore": "91.0",
        "amountStability": "0.940",
        "medianAmount": "9.99",
        "latestAmount": "10.99",
    }

    assert _future_status(profile) == "price_changed"
    assert _expected_amount(profile) == Decimal("10.99")
