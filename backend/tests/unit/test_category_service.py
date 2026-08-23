from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

from app.services.category_service import list_categories


def test_list_categories_maps_persisted_categories_to_api_schema() -> None:
    db = MagicMock()
    expense_id = uuid4()
    income_id = uuid4()
    db.scalars.return_value.all.return_value = [
        SimpleNamespace(id=expense_id, name="Food", transaction_type="expense"),
        SimpleNamespace(id=income_id, name="Salary", transaction_type="income"),
    ]

    categories = list_categories(db)

    assert [(item.id, item.name, item.transactionType.value) for item in categories] == [
        (str(expense_id), "Food", "expense"),
        (str(income_id), "Salary", "income"),
    ]
    db.scalars.assert_called_once()
