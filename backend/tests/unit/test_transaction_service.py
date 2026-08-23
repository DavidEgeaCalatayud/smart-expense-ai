from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.schemas import TransactionStatus, TransactionType
from app.services.transaction_service import (
    TransactionInputError,
    _get_category,
    _parse_transaction_date,
    calculate_status,
)


@pytest.mark.parametrize(
    ("amount", "transaction_type", "expected"),
    [
        (50, TransactionType.expense, TransactionStatus.normal),
        (120, TransactionType.expense, TransactionStatus.normal),
        (120.01, TransactionType.expense, TransactionStatus.review),
        (500, TransactionType.income, TransactionStatus.normal),
    ],
)
def test_calculate_status_is_deterministic(
    amount: float,
    transaction_type: TransactionType,
    expected: TransactionStatus,
) -> None:
    assert calculate_status(amount, transaction_type) == expected


def test_parse_transaction_date_accepts_iso_date() -> None:
    assert _parse_transaction_date("2026-08-24") == date(2026, 8, 24)


def test_parse_transaction_date_rejects_invalid_date() -> None:
    with pytest.raises(TransactionInputError, match="YYYY-MM-DD"):
        _parse_transaction_date("24/08/2026")


def test_get_category_rejects_unknown_category() -> None:
    db = MagicMock()
    db.scalar.return_value = None

    with pytest.raises(TransactionInputError, match="Unknown category"):
        _get_category(db, "Unknown", TransactionType.expense)


def test_get_category_rejects_wrong_transaction_type() -> None:
    db = MagicMock()
    db.scalar.return_value = SimpleNamespace(transaction_type="income")

    with pytest.raises(TransactionInputError, match="not valid for expense"):
        _get_category(db, "Salary", TransactionType.expense)
