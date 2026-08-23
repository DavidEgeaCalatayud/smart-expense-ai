from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.db.session import engine
from app.main import app
from app.models.transaction import Transaction as TransactionModel


pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def clean_transactions() -> Generator[None, None, None]:
    with engine.begin() as connection:
        connection.execute(delete(TransactionModel))

    yield

    with engine.begin() as connection:
        connection.execute(delete(TransactionModel))


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client


def transaction_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "merchant": "Integration Market",
        "description": "PostgreSQL integration test",
        "category": "Food",
        "amount": 42.50,
        "date": "2026-08-24",
        "type": "expense",
        "paymentMethod": "card",
        "isRecurring": False,
    }
    payload.update(overrides)
    return payload


def test_categories_are_served_from_seeded_postgresql_data(client: TestClient) -> None:
    response = client.get("/api/categories")

    assert response.status_code == 200
    categories = response.json()
    assert {item["name"] for item in categories} >= {"Food", "Salary"}
    assert next(item for item in categories if item["name"] == "Food")["transactionType"] == "expense"
    assert next(item for item in categories if item["name"] == "Salary")["transactionType"] == "income"


def test_transaction_crud_round_trip_uses_postgresql(client: TestClient) -> None:
    create_response = client.post("/api/transactions", json=transaction_payload())

    assert create_response.status_code == 201
    created = create_response.json()
    transaction_id = created["id"]
    assert created["status"] == "normal"

    list_response = client.get("/api/transactions")
    assert list_response.status_code == 200
    assert [item["id"] for item in list_response.json()] == [transaction_id]

    update_response = client.put(
        f"/api/transactions/{transaction_id}",
        json=transaction_payload(amount=150.25, description="Updated integration test"),
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["amount"] == 150.25
    assert updated["description"] == "Updated integration test"
    assert updated["status"] == "review"

    delete_response = client.delete(f"/api/transactions/{transaction_id}")
    assert delete_response.status_code == 204

    assert client.get("/api/transactions").json() == []


def test_transaction_survives_a_new_api_client(client: TestClient) -> None:
    create_response = client.post("/api/transactions", json=transaction_payload())
    transaction_id = create_response.json()["id"]

    with TestClient(app) as second_client:
        persisted = second_client.get("/api/transactions").json()

    assert any(item["id"] == transaction_id for item in persisted)


def test_category_type_validation_is_enforced_by_api(client: TestClient) -> None:
    response = client.post(
        "/api/transactions",
        json=transaction_payload(category="Salary", type="expense"),
    )

    assert response.status_code == 422
    assert "not valid for expense" in response.json()["detail"]
