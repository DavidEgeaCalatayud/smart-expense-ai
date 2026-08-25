from datetime import date
from decimal import Decimal

from app.services.historical_analysis_v2_2 import analyze_historical_transactions_v2_2
from app.services.intelligence_rules import TransactionSnapshot


def tx(identifier: str, merchant: str, value: str, amount: str = "29.90") -> TransactionSnapshot:
    return TransactionSnapshot(
        id=identifier,
        merchant=merchant,
        amount=Decimal(amount),
        transaction_date=date.fromisoformat(value),
        category="Subscriptions",
    )


def test_month_start_weekend_shift_does_not_create_false_concurrent_periods() -> None:
    variants = ("Fitness Pro", "FITNESS PRO*MEMBER")
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


def _prior_fitness_episode() -> list[TransactionSnapshot]:
    variants = ("Fitness Pro", "FITNESS PRO*MEMBER")
    values = (
        "2023-11-01",
        "2023-12-01",
        "2024-01-01",
        "2024-02-01",
        "2024-03-01",
        "2024-04-01",
        "2024-05-01",
    )
    return [
        tx(f"prior-{index}", variants[(index - 1) % 2], value)
        for index, value in enumerate(values, start=1)
    ]


def test_dormant_lifecycle_does_not_emit_current_recurring_profile() -> None:
    transactions = _prior_fitness_episode()

    _, _, _, result = analyze_historical_transactions_v2_2(
        transactions,
        12,
        analysis_end=date(2025, 2, 27),
    )

    profiles = [
        profile
        for profile in result["recurringProfiles"]
        if profile["canonicalMerchant"] == "fitness pro"
    ]
    assert profiles == []


def test_early_posted_reactivation_waits_until_nominal_billing_month() -> None:
    transactions = _prior_fitness_episode()
    # 2025-03-01 is Saturday, so the bank-visible charge lands on 2025-02-28.
    transactions.append(tx("reactivated-1", "FITNESS PRO*MEMBER", "2025-02-28"))

    _, _, _, february = analyze_historical_transactions_v2_2(
        transactions,
        12,
        analysis_end=date(2025, 2, 28),
    )
    assert not any(
        profile["streamBasis"] == "merchant_lifecycle_reactivation"
        for profile in february["recurringProfiles"]
    )

    _, _, _, march = analyze_historical_transactions_v2_2(
        transactions,
        12,
        analysis_end=date(2025, 3, 31),
    )
    profiles = [
        profile
        for profile in march["recurringProfiles"]
        if profile["canonicalMerchant"] == "fitness pro"
    ]
    assert len(profiles) == 1
    profile = profiles[0]
    assert profile["streamBasis"] == "merchant_lifecycle_reactivation"
    assert profile["cadence"] == "monthly"
    assert profile["occurrenceCount"] == 1
    assert profile["priorEpisodeOccurrenceCount"] == 7
    assert profile["lifecycleEpisodeCount"] == 2
    assert profile["lifecycleReactivated"] is True
    assert profile["missedExpectedOccurrences"] == 0
    assert profile["isExpectedPaymentMissing"] is False
    assert profile["nextExpectedDate"] == "2025-04-01"


def test_reactivated_episode_grows_without_inheriting_dormant_misses() -> None:
    transactions = _prior_fitness_episode()
    transactions.extend(
        [
            tx("reactivated-1", "FITNESS PRO*MEMBER", "2025-02-28"),
            tx("reactivated-2", "Fitness Pro", "2025-04-01"),
            tx("reactivated-3", "FITNESS PRO*MEMBER", "2025-05-01"),
        ]
    )

    _, _, _, result = analyze_historical_transactions_v2_2(
        transactions,
        12,
        analysis_end=date(2025, 5, 31),
    )

    profile = next(
        profile
        for profile in result["recurringProfiles"]
        if profile["canonicalMerchant"] == "fitness pro"
    )
    assert profile["streamBasis"] == "merchant_lifecycle_reactivation"
    assert profile["occurrenceCount"] == 3
    assert profile["consecutivePeriods"] == 3
    assert profile["missedExpectedOccurrences"] == 0
    assert profile["isExpectedPaymentMissing"] is False


def test_one_off_return_on_wrong_calendar_position_does_not_reactivate() -> None:
    transactions = _prior_fitness_episode()
    transactions.append(tx("one-off", "FITNESS PRO*MEMBER", "2025-03-14"))

    _, _, _, result = analyze_historical_transactions_v2_2(
        transactions,
        12,
        analysis_end=date(2025, 3, 31),
    )

    assert not any(
        profile["streamBasis"] == "merchant_lifecycle_reactivation"
        for profile in result["recurringProfiles"]
    )


def test_one_off_return_with_large_price_change_does_not_reactivate() -> None:
    transactions = _prior_fitness_episode()
    transactions.append(tx("one-off", "FITNESS PRO*MEMBER", "2025-02-28", "89.90"))

    _, _, _, result = analyze_historical_transactions_v2_2(
        transactions,
        12,
        analysis_end=date(2025, 3, 31),
    )

    assert not any(
        profile["streamBasis"] == "merchant_lifecycle_reactivation"
        for profile in result["recurringProfiles"]
    )
