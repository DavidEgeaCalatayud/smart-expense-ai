from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.db.session import engine
from app.main import app
from app.models.budget import Budget
from app.models.category import Category
from app.models.transaction import Transaction as TransactionModel
from app.models.user import User


pytestmark = pytest.mark.integration
API_V1 = "/api/v1"
API_V2 = "/api/v2"


@pytest.fixture(autouse=True)
def clean_account_data() -> Generator[None, None, None]:
    with engine.begin() as connection:
        connection.execute(delete(Budget))
        connection.execute(delete(TransactionModel))
        connection.execute(delete(Category).where(Category.owner_user_id.is_not(None)))
        connection.execute(delete(User))
    yield
    with engine.begin() as connection:
        connection.execute(delete(Budget))
        connection.execute(delete(TransactionModel))
        connection.execute(delete(Category).where(Category.owner_user_id.is_not(None)))
        connection.execute(delete(User))


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client


def register(client: TestClient, email: str) -> None:
    response = client.post(
        f"{API_V1}/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery-staple",
            "displayName": "Category Budget Owner",
        },
    )
    assert response.status_code == 201


def create_category(client: TestClient, name: str, transaction_type: str = "expense") -> dict[str, object]:
    response = client.post(
        f"{API_V1}/categories",
        json={"name": name, "transactionType": transaction_type},
    )
    assert response.status_code == 201, response.text
    return response.json()


def expense_payload(category: str, amount: str, transaction_date: str = "2026-08-24") -> dict[str, object]:
    return {
        "merchant": "Budget Test Merchant",
        "description": "Category and budget integration",
        "category": category,
        "amount": amount,
        "date": transaction_date,
        "type": "expense",
        "paymentMethod": "card",
        "isRecurring": False,
    }


def create_expense(client: TestClient, category: str, amount: str, transaction_date: str = "2026-08-24") -> dict[str, object]:
    response = client.post(
        f"{API_V2}/transactions",
        json=expense_payload(category, amount, transaction_date),
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_custom_categories_are_isolated_and_system_categories_are_immutable() -> None:
    with TestClient(app) as owner, TestClient(app) as other:
        register(owner, "categories-owner@example.com")
        gym = create_category(owner, "Gym")
        assert gym["scope"] == "user"
        assert gym["archived"] is False
        assert gym["transactionCount"] == 0

        duplicate_system = owner.post(
            f"{API_V1}/categories",
            json={"name": "Food", "transactionType": "expense"},
        )
        assert duplicate_system.status_code == 409
        assert duplicate_system.json()["error"]["code"] == "category_conflict"

        categories = owner.get(f"{API_V1}/categories").json()
        food = next(item for item in categories if item["name"] == "Food")
        assert food["scope"] == "system"
        assert owner.patch(
            f"{API_V1}/categories/{food['id']}", json={"name": "Renamed Food"}
        ).status_code == 404

        register(other, "categories-other@example.com")
        other_names = {item["name"] for item in other.get(f"{API_V1}/categories").json()}
        assert "Gym" not in other_names
        assert other.post(
            f"{API_V2}/transactions",
            json=expense_payload("Gym", "10.00"),
        ).status_code == 422


def test_archive_can_preserve_history_restore_or_atomically_reassign() -> None:
    with TestClient(app) as client:
        register(client, "archive-owner@example.com")
        gym = create_category(client, "Gym")
        create_expense(client, "Gym", "42.50")

        archived = client.post(
            f"{API_V1}/categories/{gym['id']}/archive",
            json={"mode": "archive"},
        )
        assert archived.status_code == 200
        assert archived.json()["archived"] is True
        assert archived.json()["transactionCount"] == 1
        assert all(item["name"] != "Gym" for item in client.get(f"{API_V1}/categories").json())
        assert client.get(f"{API_V2}/transactions").json()["items"][0]["category"] == "Gym"

        create_rejected = client.post(
            f"{API_V2}/transactions",
            json=expense_payload("Gym", "8.00", "2026-08-25"),
        )
        assert create_rejected.status_code == 422

        restored = client.post(f"{API_V1}/categories/{gym['id']}/restore")
        assert restored.status_code == 200
        assert restored.json()["archived"] is False
        assert restored.json()["transactionCount"] == 1

        travel = create_category(client, "Travel")
        create_expense(client, "Travel", "99.00", "2026-08-25")
        visible = client.get(f"{API_V1}/categories").json()
        other = next(item for item in visible if item["name"] == "Other")
        reassigned = client.post(
            f"{API_V1}/categories/{travel['id']}/archive",
            json={"mode": "reassign", "reassignToCategoryId": other["id"]},
        )
        assert reassigned.status_code == 200
        assert reassigned.json()["archived"] is True
        assert reassigned.json()["transactionCount"] == 0
        transaction_categories = {
            item["category"] for item in client.get(f"{API_V2}/transactions").json()["items"]
        }
        assert "Travel" not in transaction_categories
        assert "Other" in transaction_categories


def test_monthly_budgets_use_decimal_strings_and_persisted_expense_spend(client: TestClient) -> None:
    register(client, "budget-owner@example.com")
    gym = create_category(client, "Gym")
    create_expense(client, "Gym", "328.00")

    overall = client.post(
        f"{API_V2}/budgets",
        json={"month": "2026-08", "categoryId": None, "limitAmount": "2000.00"},
    )
    assert overall.status_code == 201, overall.text
    category_budget = client.post(
        f"{API_V2}/budgets",
        json={"month": "2026-08", "categoryId": gym["id"], "limitAmount": "400.00"},
    )
    assert category_budget.status_code == 201, category_budget.text

    duplicate = client.post(
        f"{API_V2}/budgets",
        json={"month": "2026-08", "categoryId": None, "limitAmount": "2500.00"},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "budget_conflict"

    numeric_money = client.post(
        f"{API_V2}/budgets",
        json={"month": "2026-09", "categoryId": None, "limitAmount": 2000.00},
    )
    assert numeric_money.status_code == 422

    payload = client.get(f"{API_V2}/budgets?month=2026-08").json()
    assert payload["totalBudget"]["limitAmount"] == "2000.00"
    assert payload["totalBudget"]["spentAmount"] == "328.00"
    assert payload["totalBudget"]["remainingAmount"] == "1672.00"
    assert payload["totalBudget"]["percentUsed"] == "16.4"
    assert 0 <= payload["totalBudget"]["daysRemaining"] <= 31

    gym_budget = payload["categoryBudgets"][0]
    assert gym_budget["categoryName"] == "Gym"
    assert gym_budget["spentAmount"] == "328.00"
    assert gym_budget["remainingAmount"] == "72.00"
    assert gym_budget["percentUsed"] == "82.0"
    assert gym_budget["overBudget"] is False

    updated = client.put(
        f"{API_V2}/budgets/{overall.json()['id']}",
        json={"limitAmount": "300.00"},
    )
    assert updated.status_code == 200
    exceeded = client.get(f"{API_V2}/budgets?month=2026-08").json()["totalBudget"]
    assert exceeded["remainingAmount"] == "-28.00"
    assert exceeded["overBudget"] is True


def test_budget_category_rules_isolation_and_privacy_export() -> None:
    with TestClient(app) as owner, TestClient(app) as other:
        register(owner, "budget-private-owner@example.com")
        gym = create_category(owner, "Private Gym")
        budget = owner.post(
            f"{API_V2}/budgets",
            json={"month": "2026-08", "categoryId": gym["id"], "limitAmount": "90.00"},
        )
        assert budget.status_code == 201

        export = owner.get(f"{API_V1}/auth/privacy-export")
        assert export.status_code == 200
        export_payload = export.json()
        assert export_payload["customCategories"][0]["name"] == "Private Gym"
        assert export_payload["budgets"][0]["limitAmount"] == "90.00"

        archived = owner.post(
            f"{API_V1}/categories/{gym['id']}/archive",
            json={"mode": "archive"},
        )
        assert archived.status_code == 200
        blocked = owner.post(
            f"{API_V2}/budgets",
            json={"month": "2026-09", "categoryId": gym["id"], "limitAmount": "100.00"},
        )
        assert blocked.status_code == 422
        august = owner.get(f"{API_V2}/budgets?month=2026-08").json()
        assert august["categoryBudgets"][0]["categoryArchived"] is True

        register(other, "budget-private-other@example.com")
        assert other.put(
            f"{API_V2}/budgets/{budget.json()['id']}", json={"limitAmount": "10.00"}
        ).status_code == 404
        assert other.delete(f"{API_V2}/budgets/{budget.json()['id']}").status_code == 404


def test_csv_import_can_use_only_visible_active_custom_categories(client: TestClient) -> None:
    register(client, "csv-custom-category@example.com")
    create_category(client, "Trips")
    request = {
        "filename": "custom-category.csv",
        "content": "Date,Merchant,Amount,Category\n2026-08-24,Train,35.00,Trips",
        "mapping": {
            "date": "Date",
            "amount": "Amount",
            "merchant": "Merchant",
            "description": None,
            "category": "Category",
            "type": None,
            "currency": None,
            "paymentMethod": None,
        },
        "options": {
            "dateFormat": "yyyy-mm-dd",
            "decimalSeparator": "dot",
            "amountConvention": "positive_expense",
            "defaultType": "expense",
            "defaultPaymentMethod": "card",
        },
    }
    preview = client.post(f"{API_V2}/imports/csv/preview", json=request)
    assert preview.status_code == 200, preview.text
    assert preview.json()["validRows"] == 1
    assert preview.json()["previewRows"][0]["transaction"]["category"] == "Trips"
