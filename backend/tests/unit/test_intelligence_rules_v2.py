from datetime import date
from decimal import Decimal

from app.services.intelligence_rules import TransactionSnapshot
from app.services.intelligence_rules_v2 import (
    detect_amount_anomalies_v2,
    detect_duplicate_subscriptions_v2,
    detect_frequency_anomalies_v2,
    detect_recurring_patterns_v2,
)


def tx(
    identifier: str,
    merchant: str,
    amount: str,
    value: str,
    category: str = "Subscriptions",
) -> TransactionSnapshot:
    return TransactionSnapshot(
        id=identifier,
        merchant=merchant,
        amount=Decimal(amount),
        transaction_date=date.fromisoformat(value),
        category=category,
    )


def test_recurring_rules_use_independent_streams_inside_one_canonical_merchant() -> None:
    transactions = [
        tx("icloud-jan", "Apple iCloud", "2.99", "2026-01-05"),
        tx("music-jan", "Apple Music", "10.99", "2026-01-20"),
        tx("icloud-feb", "Apple iCloud", "2.99", "2026-02-05"),
        tx("music-feb", "Apple Music", "10.99", "2026-02-20"),
        tx("icloud-mar", "Apple iCloud", "2.99", "2026-03-05"),
        tx("music-mar", "Apple Music", "10.99", "2026-03-20"),
        tx("icloud-apr", "Apple iCloud", "2.99", "2026-04-05"),
        tx("music-apr", "Apple Music", "10.99", "2026-04-20"),
        tx("store", "Apple Store", "899.00", "2026-04-22"),
    ]

    findings = detect_recurring_patterns_v2(
        transactions,
        analysis_date=date(2026, 4, 30),
    )
    recurring = [item for item in findings if item.finding_type == "recurring_pattern"]

    assert len(recurring) == 2
    assert {item.evidence["streamDescriptor"] for item in recurring} == {"icloud", "music"}
    assert all(item.evidence["canonicalMerchant"] == "apple" for item in recurring)
    assert all(item.evidence["patternScore"] for item in recurring)
    assert not any("store" in str(item.evidence["streamKey"]) for item in recurring)


def test_recurring_rules_create_separate_missing_payment_finding_only_with_strong_history() -> None:
    transactions = [
        tx("jan", "StreamBox", "9.99", "2026-01-31"),
        tx("feb", "StreamBox", "9.99", "2026-02-28"),
        tx("mar", "StreamBox", "9.99", "2026-03-31"),
        tx("apr", "StreamBox", "9.99", "2026-04-30"),
    ]

    findings = detect_recurring_patterns_v2(
        transactions,
        analysis_date=date(2026, 6, 15),
    )
    missing = [item for item in findings if item.finding_type == "recurring_payment_missing"]

    assert len(missing) == 1
    assert missing[0].severity in {"warning", "high"}
    assert int(missing[0].evidence["missedExpectedOccurrences"]) >= 1
    assert int(missing[0].evidence["overdueDays"]) > 0
    assert missing[0].evidence["nextExpectedDate"] == "2026-05-31"


def test_amount_anomaly_uses_only_prior_values_and_can_fall_back_to_category() -> None:
    history = [
        tx(f"food-{index}", f"Market {index}", amount, f"2026-01-{index + 1:02d}", "Food")
        for index, amount in enumerate(
            ["10.00", "11.00", "9.00", "10.00", "10.50", "9.50", "10.00", "11.00"]
        )
    ]
    candidate = tx("new-merchant", "First Visit Shop", "80.00", "2026-02-01", "Food")

    findings = detect_amount_anomalies_v2([*history, candidate])

    assert len(findings) == 1
    finding = findings[0]
    assert finding.evidence["transactionId"] == "new-merchant"
    assert finding.evidence["baselineScope"] == "category"
    assert finding.evidence["baselineCount"] == 8
    assert finding.evidence["amount"] == "80.00"


def test_amount_anomaly_baseline_does_not_include_candidate_or_future_transactions() -> None:
    transactions = [
        tx("1", "Cloud Tools", "20.00", "2026-01-01"),
        tx("2", "Cloud Tools", "21.00", "2026-02-01"),
        tx("3", "Cloud Tools", "19.00", "2026-03-01"),
        tx("4", "Cloud Tools", "20.00", "2026-04-01"),
        tx("5", "Cloud Tools", "85.00", "2026-05-01"),
        tx("6", "Cloud Tools", "1000.00", "2026-06-01"),
    ]

    findings = detect_amount_anomalies_v2(transactions)
    first = next(item for item in findings if item.evidence["transactionId"] == "5")

    assert first.evidence["baselineCount"] == 4
    assert first.evidence["baselineMedian"] == "20.00"
    assert first.evidence["ratio"] == "4.25"


def test_frequency_anomaly_requires_history_and_detects_monthly_spike_and_burst() -> None:
    transactions = [
        tx("jan", "API Tools", "5.00", "2026-01-10"),
        tx("feb", "API Tools", "5.00", "2026-02-10"),
        tx("mar", "API Tools", "5.00", "2026-03-10"),
        tx("apr-1", "API Tools", "5.00", "2026-04-01"),
        tx("apr-2", "API Tools", "5.00", "2026-04-02"),
        tx("apr-3", "API Tools", "5.00", "2026-04-03"),
        tx("apr-4", "API Tools", "5.00", "2026-04-04"),
    ]

    findings = detect_frequency_anomalies_v2(transactions)

    assert len(findings) == 1
    finding = findings[0]
    assert finding.finding_type == "frequency_anomaly"
    assert finding.severity == "high"
    assert finding.evidence["period"] == "2026-04"
    assert finding.evidence["currentCount"] == 4
    assert finding.evidence["baselineMedianCount"] == "1.0"
    assert finding.evidence["frequencyRatio"] == "4.00"
    assert finding.evidence["maxChargesIn7Days"] == 4


def test_frequency_anomaly_does_not_fire_for_new_merchant_without_three_prior_periods() -> None:
    transactions = [
        tx("jan", "Young Merchant", "5.00", "2026-01-10"),
        tx("feb", "Young Merchant", "5.00", "2026-02-10"),
        tx("mar-1", "Young Merchant", "5.00", "2026-03-01"),
        tx("mar-2", "Young Merchant", "5.00", "2026-03-02"),
        tx("mar-3", "Young Merchant", "5.00", "2026-03-03"),
    ]

    assert detect_frequency_anomalies_v2(transactions) == []


def test_duplicate_subscription_uses_canonical_merchant_variants() -> None:
    findings = detect_duplicate_subscriptions_v2(
        [
            tx("1", "AMZN Mktp ES*111", "12.99", "2026-05-02"),
            tx("2", "Amazon EU SARL", "12.99", "2026-05-04"),
            tx("3", "AMAZON*222", "12.99", "2026-06-02"),
            tx("4", "Amazon.es", "13.20", "2026-06-03"),
        ]
    )

    assert len(findings) == 1
    assert findings[0].evidence["canonicalMerchant"] == "amazon"
    assert findings[0].evidence["duplicateMonths"] == ["2026-05", "2026-06"]
