from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from app.services.amount_anomaly_baseline import (
    BASELINE_POLICY,
    evaluate_amount_anomaly,
)
from app.services.historical_analysis_v2_2 import analyze_historical_transactions_v2_2
from app.services.intelligence_rules import TransactionSnapshot
from app.services.intelligence_rules_v2 import detect_amount_anomalies_v2


def _tx(
    transaction_id: str,
    merchant: str,
    amount: str,
    when: date,
    category: str = "Shopping",
) -> TransactionSnapshot:
    return TransactionSnapshot(
        id=transaction_id,
        merchant=merchant,
        amount=Decimal(amount),
        transaction_date=when,
        category=category,
    )


def test_distribution_fence_preserves_legitimate_high_variance_upper_tail() -> None:
    history = [
        Decimal("12.00"),
        Decimal("19.00"),
        Decimal("27.00"),
        Decimal("35.00"),
        Decimal("43.00"),
        Decimal("51.00"),
        Decimal("60.00"),
        Decimal("68.00"),
        Decimal("76.00"),
        Decimal("84.00"),
        Decimal("93.00"),
        Decimal("101.00"),
    ]

    decision = evaluate_amount_anomaly(Decimal("105.00"), history)

    assert decision is not None
    assert decision.is_anomaly is False
    assert decision.interquartile_range > Decimal("0")
    assert decision.distribution_upper_fence > Decimal("105.00")


def test_distribution_fence_still_detects_extreme_amount_spike() -> None:
    history = [
        Decimal("12.00"),
        Decimal("19.00"),
        Decimal("27.00"),
        Decimal("35.00"),
        Decimal("43.00"),
        Decimal("51.00"),
        Decimal("60.00"),
        Decimal("68.00"),
        Decimal("76.00"),
        Decimal("84.00"),
        Decimal("93.00"),
        Decimal("101.00"),
    ]

    decision = evaluate_amount_anomaly(Decimal("420.00"), history)

    assert decision is not None
    assert decision.is_anomaly is True
    assert Decimal("420.00") >= decision.threshold


def test_rules_do_not_use_category_history_as_new_merchant_baseline() -> None:
    transactions = [
        _tx(
            f"ordinary-{index}",
            f"Ordinary Shop {index}",
            str(Decimal("10.00") + Decimal(index)),
            date(2024, 1, 1) + timedelta(days=index),
        )
        for index in range(10)
    ]
    transactions.append(
        _tx("new-merchant", "Furniture House", "920.00", date(2024, 2, 1))
    )

    findings = detect_amount_anomalies_v2(transactions)

    assert not any(
        finding.finding_type == "spending_anomaly"
        and finding.evidence.get("transactionId") == "new-merchant"
        for finding in findings
    )


def test_rules_emit_distribution_evidence_for_qualified_merchant_anomaly() -> None:
    transactions = [
        _tx(f"history-{index}", "Cafe Stable", amount, date(2024, index + 1, 5), "Food")
        for index, amount in enumerate(("20.00", "21.00", "19.00", "20.00"))
    ]
    transactions.append(_tx("spike", "Cafe Stable", "85.00", date(2024, 5, 5), "Food"))

    findings = detect_amount_anomalies_v2(transactions)
    anomaly = next(
        finding
        for finding in findings
        if finding.finding_type == "spending_anomaly"
        and finding.evidence.get("transactionId") == "spike"
    )

    assert anomaly.evidence["baselineScope"] == "merchant"
    assert anomaly.evidence["baselinePolicy"] == BASELINE_POLICY
    assert anomaly.evidence["baselineCount"] == 4
    assert "interquartileRange" in anomaly.evidence
    assert "distributionUpperFence" in anomaly.evidence


def test_historical_v22_uses_same_qualified_amount_policy() -> None:
    transactions = [
        _tx(f"history-{index}", "Cloud Tools", amount, date(2024, index + 1, 5), "Software")
        for index, amount in enumerate(("20.00", "21.00", "19.00", "20.00"))
    ]
    transactions.append(_tx("spike", "Cloud Tools", "85.00", date(2024, 5, 5), "Software"))

    _, _, _, result = analyze_historical_transactions_v2_2(
        transactions,
        6,
        analysis_end=date(2024, 5, 31),
    )
    anomaly = next(item for item in result["outliers"] if item["transactionId"] == "spike")

    assert anomaly["baselineScope"] == "merchant"
    assert anomaly["baselinePolicy"] == BASELINE_POLICY
    assert anomaly["baselineCount"] == 4
    assert "interquartileRange" in anomaly
    assert "distributionUpperFence" in anomaly
