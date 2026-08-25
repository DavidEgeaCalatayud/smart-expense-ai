from datetime import date
from decimal import Decimal

from app.services.historical_analysis_v2_2 import analyze_historical_transactions_v2_2
from app.services.intelligence_rules import TransactionSnapshot


def tx(identifier: str, merchant: str, value: str) -> TransactionSnapshot:
    return TransactionSnapshot(
        id=identifier,
        merchant=merchant,
        amount=Decimal("29.90"),
        transaction_date=date.fromisoformat(value),
        category="Subscriptions",
    )


def test_month_start_weekend_shift_does_not_create_false_concurrent_periods() -> None:
    variants = ("Fitness Pro", "FITNESS PRO*MEMBER")
    # Nominal first-of-month schedule. Apr 1 and Jul 1 fell on Saturdays and are
    # represented by the preceding Friday, crossing the observed calendar month.
    values = (
        "2023-01-02",
        "2023-02-01",
        "2023-03-01",
        "2023-03-31",  # nominal 2023-04-01
        "2023-05-01",
        "2023-06-01",
        "2023-06-30",  # nominal 2023-07-01
        "2023-08-01",
        "2023-09-01",
        "2023-10-02",
        "2023-11-01",
        "2023-12-01",
        "2024-01-01",
        "2024-02-01",
        "2024-03-01",
        "2024-04-01",
        "2024-05-01",
    )
    transactions = [
        tx(f"fitness-{index}", variants[(index - 1) % len(variants)], value)
        for index, value in enumerate(values, start=1)
    ]

    _, _, _, result = analyze_historical_transactions_v2_2(
        transactions,
        12,
        analysis_end=date(2024, 5, 31),
    )

    profiles = [
        profile
        for profile in result["recurringProfiles"]
        if profile["canonicalMerchant"] == "fitness pro"
    ]
    assert len(profiles) == 1
    profile = profiles[0]
    assert profile["streamBasis"] == "merchant_price_continuity"
    assert profile["cadence"] == "monthly"
    assert profile["canonicalVariantCount"] == 2
    assert profile["priceRegimeCount"] == 1
    assert profile["isExpectedPaymentMissing"] is False
