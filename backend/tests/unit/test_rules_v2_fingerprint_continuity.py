from datetime import date
from decimal import Decimal

from app.services.intelligence_rules import TransactionSnapshot
from app.services.intelligence_rules_v2 import detect_amount_anomalies_v2


def _tx(identifier: str, amount: str, value: str) -> TransactionSnapshot:
    return TransactionSnapshot(
        id=identifier,
        merchant="Cloud Tools",
        amount=Decimal(amount),
        transaction_date=date.fromisoformat(value),
        category="Subscriptions",
    )


def test_amount_anomaly_keeps_transaction_identity_in_fingerprint() -> None:
    findings = detect_amount_anomalies_v2(
        [
            _tx("1", "20.00", "2026-01-01"),
            _tx("2", "21.00", "2026-02-01"),
            _tx("3", "19.00", "2026-03-01"),
            _tx("4", "20.00", "2026-04-01"),
            _tx("5", "85.00", "2026-05-01"),
        ]
    )

    assert findings[0].fingerprint.endswith(":5")
