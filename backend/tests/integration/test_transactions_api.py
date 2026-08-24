from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.db.session import engine
from app.main import app
from app.models.transaction import Transaction as TransactionModel
from app.models.user import User


pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def clean_account_data() -> Generator[None, None, None]:
    with engine.begin() as connection:
        connection.execute(delete(TransactionModel))
        connection.execute(delete(User))

    yield

    with engine.begin() as connection:
        connection.execute(delete(TransactionModel))
        connection.execute(delete(User))


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client


def register(client: TestClient, email: str = "owner@example.com") -> dict[str, object]:
    response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery-staple",
            "displayName": "Integration Owner",
        },
    )
    assert response.status_code == 201
    return response.json()


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


def test_protected_financial_endpoints_require_authentication(client: TestClient) -> None:
    assert client.get("/api/categories").status_code == 401
    assert client.get("/api/transactions").status_code == 401


def test_registration_sets_session_and_exposes_current_user(client: TestClient) -> None:
    registered = register(client)

    assert registered["user"]["email"] == "owner@example.com"
    assert "smart_expense_session" in client.cookies

    me_response = client.get("/api/auth/me")
    assert me_response.status_code == 200
    assert me_response.json()["displayName"] == "Integration Owner"


def test_login_restores_access_in_a_new_client(client: TestClient) -> None:
    register(client)
    client.post("/api/auth/logout")

    with TestClient(app) as second_client:
        login_response = second_client.post(
            "/api/auth/login",
            json={"email": "OWNER@example.com", "password": "correct-horse-battery-staple"},
        )
        assert login_response.status_code == 200
        assert second_client.get("/api/transactions").status_code == 200


def test_duplicate_registration_and_invalid_login_are_rejected(client: TestClient) -> None:
    register(client)
    client.post("/api/auth/logout")

    duplicate = client.post(
        "/api/auth/register",
        json={
            "email": "OWNER@example.com",
            "password": "another-password",
            "displayName": "Duplicate",
        },
    )
    assert duplicate.status_code == 409

    invalid_login = client.post(
        "/api/auth/login",
        json={"email": "owner@example.com", "password": "wrong-password"},
    )
    assert invalid_login.status_code == 401


def test_categories_are_served_to_authenticated_user(client: TestClient) -> None:
    register(client)
    response = client.get("/api/categories")

    assert response.status_code == 200
    categories = response.json()
    assert {item["name"] for item in categories} >= {"Food", "Salary"}


def test_transaction_crud_round_trip_uses_postgresql(client: TestClient) -> None:
    register(client)
    create_response = client.post("/api/transactions", json=transaction_payload())

    assert create_response.status_code == 201
    created = create_response.json()
    transaction_id = created["id"]

    list_response = client.get("/api/transactions")
    assert [item["id"] for item in list_response.json()] == [transaction_id]

    update_response = client.put(
        f"/api/transactions/{transaction_id}",
        json=transaction_payload(amount=150.25, description="Updated integration test"),
    )
    assert update_response.status_code == 200
    assert update_response.json()["status"] == "review"

    assert client.delete(f"/api/transactions/{transaction_id}").status_code == 204
    assert client.get("/api/transactions").json() == []


def test_transaction_ownership_is_enforced_between_users(client: TestClient) -> None:
    register(client, "first@example.com")
    created = client.post("/api/transactions", json=transaction_payload()).json()
    transaction_id = created["id"]
    client.post("/api/auth/logout")

    with TestClient(app) as second_client:
        register(second_client, "second@example.com")
        assert second_client.get("/api/transactions").json() == []
        assert second_client.put(
            f"/api/transactions/{transaction_id}",
            json=transaction_payload(amount=99),
        ).status_code == 404
        assert second_client.delete(f"/api/transactions/{transaction_id}").status_code == 404

    login_response = client.post(
        "/api/auth/login",
        json={"email": "first@example.com", "password": "correct-horse-battery-staple"},
    )
    assert login_response.status_code == 200
    assert [item["id"] for item in client.get("/api/transactions").json()] == [transaction_id]


def test_category_type_validation_is_enforced_by_api(client: TestClient) -> None:
    register(client)
    response = client.post(
        "/api/transactions",
        json=transaction_payload(category="Salary", type="expense"),
    )

    assert response.status_code == 422
    assert "not valid for expense" in response.json()["detail"]
