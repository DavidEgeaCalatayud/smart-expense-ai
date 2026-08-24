from datetime import date
from decimal import Decimal

from app.services.historical_analysis_v2_1 import analyze_historical_transactions_v2_1
from app.services.intelligence_rules import TransactionSnapshot


def tx(identifier: str, merchant: str, amount: str, value: str) -> TransactionSnapshot:
    return TransactionSnapshot(
        id=identifier,
        merchant=merchant,
        amount=Decimal(amount),
        transaction_date=date.fromisoformat(value),
        category="Subscriptions",
    )


def test_one_canonical_merchant_can_produce_multiple_recurring_streams() -> None:
    transactions: list[TransactionSnapshot] = []
    for month, last_day in ((1, 31), (2, 28), (3, 31), (4, 30), (5, 31), (6, 30)):
        transactions.extend(
            [
                tx(f"icloud-{month}", "Apple iCloud", "2.99", f"2026-{month:02d}-{last_day:02d}"),
                tx(f"music-{month}", "Apple Music", "10.99", f"2026-{month:02d}-10"),
            ]
        )
    transactions.append(tx("store", "Apple Store", "899.00", "2026-06-15"))

    _, _, _, result = analyze_historical_transactions_v2_1(
        transactions,
        6,
        analysis_end=date(2026, 6, 30),
    )

    apple_profiles = [
        profile
        for profile in result["recurringProfiles"]
        if profile["canonicalMerchant"] == "apple"
    ]

    assert len(apple_profiles) == 2
    descriptors = {profile["streamDescriptor"] for profile in apple_profiles}
    assert descriptors == {"icloud", "music"}
    assert {profile["medianAmount"] for profile in apple_profiles} == {"2.99", "10.99"}
    assert all(str(profile["streamKey"]).startswith("apple::") for profile in apple_profiles)
    assert all(profile["occurrenceCount"] == 6 for profile in apple_profiles)
    assert not any(profile["medianAmount"] == "899.00" for profile in apple_profiles)
    assert result["recurrenceSegmentation"]["strategy"] == "canonical_merchant_then_descriptor_amount_streams"
    assert result["coverage"]["recurringStreams"] == 2


def test_amount_bands_split_streams_even_without_descriptor_hints() -> None:
    transactions: list[TransactionSnapshot] = []
    for month, day in ((1, 5), (2, 5), (3, 5), (4, 5), (5, 5), (6, 5)):
        transactions.extend(
            [
                tx(f"low-{month}", "Generic Service", "5.00", f"2026-{month:02d}-{day:02d}"),
                tx(f"high-{month}", "Generic Service", "25.00", f"2026-{month:02d}-20"),
            ]
        )

    _, _, _, result = analyze_historical_transactions_v2_1(
        transactions,
        6,
        analysis_end=date(2026, 6, 30),
    )

    profiles = [
        profile
        for profile in result["recurringProfiles"]
        if profile["canonicalMerchant"] == "generic service"
    ]
    assert len(profiles) == 2
    assert {profile["medianAmount"] for profile in profiles} == {"5.00", "25.00"}
