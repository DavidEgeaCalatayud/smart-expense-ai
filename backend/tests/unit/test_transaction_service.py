from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.schemas import TransactionStatus, TransactionType
from app.services import transaction_service
from app.services.transaction_service import (
    TransactionInputError,
    _get_visible_category,
    _parse_transaction_date,
    calculate_status,
)


@pytest.mark.parametrize(
    ("amount", "transaction_type", "expected"),
    [
        (Decimal("50.00"), TransactionType.expense, TransactionStatus.normal),
        (Decimal("120.00"), TransactionType.expense, TransactionStatus.normal),
        (Decimal("120.01"), TransactionType.expense, TransactionStatus.review),
        (Decimal("500.00"), TransactionType.income, TransactionStatus.normal),
    ],
)
def test_calculate_status_is_deterministic(
    amount: Decimal,
    transaction_type: TransactionType,
    expected: TransactionStatus,
) -> None:
    assert calculate_status(amount, transaction_type) == expected


def test_decimal_threshold_does_not_depend_on_binary_float_rounding() -> None:
    assert calculate_status(Decimal("120.00"), TransactionType.expense) == TransactionStatus.normal
    assert calculate_status(Decimal("120.01"), TransactionType.expense) == TransactionStatus.review


def test_parse_transaction_date_accepts_iso_date() -> None:
    assert _parse_transaction_date("2026-08-24") == date(2026, 8, 24)


def test_parse_transaction_date_rejects_invalid_date() -> None:
    with pytest.raises(TransactionInputError, match="YYYY-MM-DD"):
        _parse_transaction_date("24/08/2026")


def test_get_visible_category_rejects_unknown_category(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = MagicMock()
    user_id = uuid4()
    monkeypatch.setattr(
        transaction_service,
        "find_active_visible_categories_by_name",
        lambda _db, _user_id, _name: [],
    )

    with pytest.raises(TransactionInputError, match="Unknown category"):
        _get_visible_category(db, user_id, "Unknown", TransactionType.expense)


def test_get_visible_category_rejects_wrong_transaction_type(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = MagicMock()
    user_id = uuid4()
    category = SimpleNamespace(transaction_type="income")
    monkeypatch.setattr(
        transaction_service,
        "find_active_visible_categories_by_name",
        lambda _db, _user_id, _name: [category],
    )

    with pytest.raises(TransactionInputError, match="not valid for expense"):
        _get_visible_category(db, user_id, "Salary", TransactionType.expense)


def test_get_visible_category_returns_compatible_visible_category(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = MagicMock()
    user_id = uuid4()
    income_category = SimpleNamespace(transaction_type="income")
    expense_category = SimpleNamespace(transaction_type="expense")
    calls: list[tuple[object, object, str]] = []

    def visible_categories(_db, _user_id, name):
        calls.append((_db, _user_id, name))
        return [income_category, expense_category]

    monkeypatch.setattr(
        transaction_service,
        "find_active_visible_categories_by_name",
        visible_categories,
    )

    result = _get_visible_category(db, user_id, "Shared Name", TransactionType.expense)

    assert result is expense_category
    assert calls == [(db, user_id, "Shared Name")]
