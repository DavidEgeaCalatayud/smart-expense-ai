from datetime import date
from decimal import Decimal

from app.services.historical_analysis_v2_2 import analyze_historical_transactions_v2_2
from app.services.intelligence_rules import TransactionSnapshot
from app.services.merchant_canonicalization import build_merchant_identity_map
from app.services.recurring_streams_v2_2 import build_recurring_streams_v2_2


def tx(identifier: str, merchant: str, amount: str, value: str) -> TransactionSnapshot:
    return TransactionSnapshot(
        id=identifier,
        merchant=merchant,
        amount=Decimal(amount),
        transaction_date=date.fromisoformat(value),
        category="Subscriptions",
    )


def test_v22_relinks_merchant_variants_across_sequential_price_regimes() -> None:
    variants = ("STREAM BOX*ONLINE", "Stream Box SL", "Stream Box Media")
    transactions: list[TransactionSnapshot] = []
    for month in range(1, 13):
        amount = "9.99" if month <= 6 else "11.99"
        transactions.append(
            tx(
                f"stream-{month}",
                variants[(month - 1) % len(variants)],
                amount,
                f"2026-{month:02d}-05",
            )
        )

    _, _, _, result = analyze_historical_transactions_v2_2(
        transactions,
        12,
        analysis_end=date(2026, 12, 31),
    )

    profiles = [
        profile
        for profile in result["recurringProfiles"]
        if profile["canonicalMerchant"] == "stream box"
    ]
    assert len(profiles) == 1
    profile = profiles[0]
    assert profile["streamBasis"] == "merchant_price_continuity"
    assert profile["cadence"] == "monthly"
    assert profile["occurrenceCount"] == 12
    assert profile["canonicalVariantCount"] == 3
    assert profile["priceRegimeCount"] == 2
    assert profile["sourceStreamCount"] >= 3
    assert set(profile["observedMerchants"]) == set(variants)


def test_v22_relinks_merchant_variants_before_any_price_change() -> None:
    variants = ("STREAM BOX*ONLINE", "Stream Box SL", "Stream Box Media")
    transactions = [
        tx(
            f"stream-{month}",
            variants[(month - 1) % len(variants)],
            "9.99",
            f"2026-{month:02d}-05",
        )
        for month in range(1, 10)
    ]

    _, _, _, result = analyze_historical_transactions_v2_2(
        transactions,
        9,
        analysis_end=date(2026, 9, 30),
    )

    profiles = [
        profile
        for profile in result["recurringProfiles"]
        if profile["canonicalMerchant"] == "stream box"
    ]
    assert len(profiles) == 1
    assert profiles[0]["streamBasis"] == "merchant_price_continuity"
    assert profiles[0]["priceRegimeCount"] == 1
    assert profiles[0]["canonicalVariantCount"] == 3
    assert profiles[0]["occurrenceCount"] == 9


def test_v22_does_not_merge_overlapping_same_merchant_subscriptions() -> None:
    transactions: list[TransactionSnapshot] = []
    for month in range(1, 7):
        transactions.extend(
            [
                tx(f"basic-{month}", "Generic Service", "9.99", f"2026-{month:02d}-05"),
                tx(f"pro-{month}", "Generic Service", "19.99", f"2026-{month:02d}-20"),
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
    assert {profile["medianAmount"] for profile in profiles} == {"9.99", "19.99"}
    assert {profile["streamBasis"] for profile in profiles} == {"amount"}
    assert all(profile["sourceStreamCount"] == 1 for profile in profiles)
    assert all(profile["priceRegimeCount"] == 1 for profile in profiles)


def test_v22_does_not_relink_long_dormant_reactivation() -> None:
    variants = ("Fitness Pro", "FITNESS PRO*MEMBER")
    transactions = [
        tx("jan", variants[0], "29.90", "2026-01-01"),
        tx("feb", variants[1], "29.90", "2026-02-01"),
        tx("mar", variants[0], "29.90", "2026-03-01"),
        tx("apr", variants[1], "29.90", "2026-04-01"),
        tx("nov", variants[0], "29.90", "2026-11-01"),
        tx("dec", variants[1], "29.90", "2026-12-01"),
    ]
    identities = build_merchant_identity_map([item.merchant for item in transactions])

    streams = build_recurring_streams_v2_2(transactions, identities)

    assert not any(stream.basis == "merchant_price_continuity" for stream in streams)


def test_v22_does_not_relink_price_regime_that_reappears() -> None:
    variants = ("STREAM BOX*ONLINE", "Stream Box SL", "Stream Box Media")
    amounts = ("9.99", "9.99", "9.99", "11.99", "11.99", "11.99", "9.99", "9.99", "9.99")
    transactions = [
        tx(
            f"stream-{month}",
            variants[(month - 1) % len(variants)],
            amounts[month - 1],
            f"2026-{month:02d}-05",
        )
        for month in range(1, 10)
    ]
    identities = build_merchant_identity_map([item.merchant for item in transactions])

    streams = build_recurring_streams_v2_2(transactions, identities)

    assert not any(stream.basis == "merchant_price_continuity" for stream in streams)
