from datetime import date
from decimal import Decimal

from app.services.intelligence_rules import TransactionSnapshot
from app.services.intelligence_rules_v2 import detect_recurring_patterns_v2


def _tx(identifier: str, value: str) -> TransactionSnapshot:
    return TransactionSnapshot(
        id=identifier,
        merchant="StreamBox",
        amount=Decimal("9.99"),
        transaction_date=date.fromisoformat(value),
        category="Subscriptions",
    )


def test_same_month_extra_charge_does_not_create_false_missing_payment() -> None:
    findings = detect_recurring_patterns_v2(
        [
            _tx("may", "2026-05-02"),
            _tx("jun", "2026-06-01"),
            _tx("jul-a", "2026-07-01"),
            _tx("jul-b", "2026-07-31"),
        ],
        analysis_date=date(2026, 8, 25),
    )

    assert any(item.finding_type == "recurring_pattern" for item in findings)
    assert not any(item.finding_type == "recurring_payment_missing" for item in findings)
