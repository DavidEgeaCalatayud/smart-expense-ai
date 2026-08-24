from datetime import date

from app.services.intelligence_rules import (
    TransactionSnapshot,
    detect_duplicate_subscriptions,
    detect_recurring_patterns,
    detect_spending_anomalies,
    normalize_merchant,
)


def tx(identifier: str, merchant: str, amount: float, value: str) -> TransactionSnapshot:
    return TransactionSnapshot(
        id=identifier,
        merchant=merchant,
        amount=amount,
        transaction_date=date.fromisoformat(value),
        category="Subscriptions",
    )


def test_normalize_merchant_is_stable_across_case_accents_and_punctuation() -> None:
    assert normalize_merchant("  Café+ PLUS #1 ") == "cafe plus 1"


def test_recurring_rule_requires_stable_amount_and_cadence() -> None:
    recurring = detect_recurring_patterns(
        [
            tx("1", "StreamBox", 9.99, "2026-05-02"),
            tx("2", "StreamBox", 10.49, "2026-06-01"),
            tx("3", "StreamBox", 9.99, "2026-07-01"),
            tx("4", "StreamBox", 10.49, "2026-07-31"),
        ]
    )

    assert len(recurring) == 1
    finding = recurring[0]
    assert finding.finding_type == "recurring_pattern"
    assert finding.evidence["cadence"] == "monthly"
    assert finding.evidence["occurrenceCount"] == 4
    assert finding.evidence["nextExpectedDate"] == "2026-08-30"

    unstable = detect_recurring_patterns(
        [
            tx("1", "Variable Shop", 10, "2026-05-01"),
            tx("2", "Variable Shop", 50, "2026-06-01"),
            tx("3", "Variable Shop", 11, "2026-07-01"),
        ]
    )
    assert unstable == []


def test_duplicate_subscription_rule_requires_repeated_near_duplicate_months() -> None:
    findings = detect_duplicate_subscriptions(
        [
            tx("1", "Video Pro", 12.99, "2026-05-02"),
            tx("2", "Video Pro", 12.99, "2026-05-04"),
            tx("3", "Video Pro", 12.99, "2026-06-02"),
            tx("4", "Video Pro", 13.20, "2026-06-03"),
            tx("5", "Video Pro", 12.99, "2026-07-02"),
        ]
    )

    assert len(findings) == 1
    finding = findings[0]
    assert finding.finding_type == "duplicate_subscription"
    assert finding.evidence["duplicateMonths"] == ["2026-05", "2026-06"]
    assert finding.evidence["pairCount"] == 2


def test_spending_anomaly_uses_prior_same_merchant_baseline() -> None:
    findings = detect_spending_anomalies(
        [
            tx("1", "Cloud Tools", 20, "2026-01-01"),
            tx("2", "Cloud Tools", 21, "2026-02-01"),
            tx("3", "Cloud Tools", 19, "2026-03-01"),
            tx("4", "Cloud Tools", 20, "2026-04-01"),
            tx("5", "Cloud Tools", 85, "2026-05-01"),
        ]
    )

    assert len(findings) == 1
    finding = findings[0]
    assert finding.finding_type == "spending_anomaly"
    assert finding.severity == "high"
    assert finding.evidence["baselineMedian"] == 20.0
    assert finding.evidence["ratio"] == 4.25


def test_spending_anomaly_does_not_fire_without_enough_history() -> None:
    assert detect_spending_anomalies(
        [
            tx("1", "Cloud Tools", 20, "2026-01-01"),
            tx("2", "Cloud Tools", 20, "2026-02-01"),
            tx("3", "Cloud Tools", 100, "2026-03-01"),
        ]
    ) == []
