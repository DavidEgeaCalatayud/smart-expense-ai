from datetime import date
from decimal import Decimal

from app.services.historical_analysis_v2_1 import analyze_historical_transactions_v2_1
from app.services.historical_analysis_v2_2 import analyze_historical_transactions_v2_2
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


def test_v22_splits_same_merchant_same_amount_by_concurrent_monthly_phase() -> None:
    transactions: list[TransactionSnapshot] = []
    for month in range(1, 7):
        transactions.extend(
            [
                tx(f"early-{month}", "Generic Service", "9.99", f"2026-{month:02d}-05"),
                tx(f"late-{month}", "Generic Service", "9.99", f"2026-{month:02d}-20"),
            ]
        )

    _, _, _, result = analyze_historical_transactions_v2_2(
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
    assert {profile["streamCalendar"] for profile in profiles} == {
        "monthly:day-05",
        "monthly:day-20",
    }
    assert {profile["streamBasis"] for profile in profiles} == {"calendar_phase"}
    assert {profile["medianAmount"] for profile in profiles} == {"9.99"}
    assert all(profile["occurrenceCount"] == 6 for profile in profiles)
    assert result["coverage"]["temporalPhaseStreams"] == 2
    assert result["recurrenceSegmentation"]["temporalPhaseProfileCount"] == 2
    assert result["recurrenceSegmentation"]["ambiguityPolicy"] == (
        "split_only_with_repeated_concurrent_calendar_evidence"
    )


def test_v22_does_not_split_one_subscription_when_billing_day_changes_over_time() -> None:
    transactions = [
        tx("jan", "Generic Service", "9.99", "2026-01-05"),
        tx("feb", "Generic Service", "9.99", "2026-02-05"),
        tx("mar", "Generic Service", "9.99", "2026-03-05"),
        tx("apr", "Generic Service", "9.99", "2026-04-20"),
        tx("may", "Generic Service", "9.99", "2026-05-20"),
        tx("jun", "Generic Service", "9.99", "2026-06-20"),
    ]

    _, _, _, result = analyze_historical_transactions_v2_2(
        transactions,
        6,
        analysis_end=date(2026, 6, 30),
    )

    profiles = [
        profile
        for profile in result["recurringProfiles"]
        if profile["canonicalMerchant"] == "generic service"
    ]
    assert len(profiles) <= 1
    assert result["coverage"]["temporalPhaseStreams"] == 0


def test_v22_splits_same_amount_weekly_streams_on_concurrent_weekdays() -> None:
    transactions: list[TransactionSnapshot] = []
    monday = date(2026, 1, 5)
    thursday = date(2026, 1, 8)
    for week in range(6):
        transactions.extend(
            [
                tx(
                    f"mon-{week}",
                    "Weekly Service",
                    "4.50",
                    date.fromordinal(monday.toordinal() + week * 7).isoformat(),
                ),
                tx(
                    f"thu-{week}",
                    "Weekly Service",
                    "4.50",
                    date.fromordinal(thursday.toordinal() + week * 7).isoformat(),
                ),
            ]
        )

    _, _, _, result = analyze_historical_transactions_v2_2(
        transactions,
        6,
        analysis_end=date(2026, 2, 28),
    )
    profiles = [
        profile
        for profile in result["recurringProfiles"]
        if profile["canonicalMerchant"] == "weekly service"
    ]
    assert len(profiles) == 2
    assert {profile["streamCalendar"] for profile in profiles} == {"weekly:mon", "weekly:thu"}
