from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.db.session import engine
from app.main import app
from app.models.user import User


pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def clean_users() -> Generator[None, None, None]:
    with engine.begin() as connection:
        connection.execute(delete(User))
    yield
    with engine.begin() as connection:
        connection.execute(delete(User))


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client


def register(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "money@example.com",
            "password": "correct-horse-battery-staple",
            "displayName": "Money Contract",
        },
    )
    assert response.status_code == 201


def payload(amount: object, merchant: str) -> dict[str, object]:
    return {
        "merchant": merchant,
        "description": "Decimal contract test",
        "category": "Food",
        "amount": amount,
        "date": "2026-08-24",
        "type": "expense",
        "paymentMethod": "card",
        "isRecurring": False,
    }


def test_v2_preserves_decimal_strings_and_exact_aggregates(client: TestClient) -> None:
    register(client)

    first = client.post("/api/v2/transactions", json=payload("0.10", "Ten cents"))
    second = client.post("/api/v2/transactions", json=payload("0.20", "Twenty cents"))

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["amount"] == "0.10"
    assert second.json()["amount"] == "0.20"

    page = client.get("/api/v2/transactions?page=1&pageSize=10").json()
    assert {item["amount"] for item in page["items"]} == {"0.10", "0.20"}

    summary = client.get("/api/v2/analytics/summary").json()
    assert summary["totalIncome"] == "0.00"
    assert summary["totalExpenses"] == "0.30"
    assert summary["balance"] == "-0.30"


def test_v1_keeps_legacy_numeric_response_shape(client: TestClient) -> None:
    register(client)
    created = client.post("/api/v1/transactions", json=payload(42.50, "Legacy Market"))

    assert created.status_code == 201
    assert created.json()["amount"] == 42.5
    assert isinstance(created.json()["amount"], float)


def test_v2_rejects_json_numbers_and_excess_fractional_precision(client: TestClient) -> None:
    register(client)

    numeric = client.post("/api/v2/transactions", json=payload(0.1, "Binary Float"))
    too_precise = client.post("/api/v2/transactions", json=payload("10.001", "Too Precise"))

    assert numeric.status_code == 422
    assert numeric.json()["error"]["code"] == "validation_error"
    assert too_precise.status_code == 422
    assert too_precise.json()["error"]["code"] == "validation_error"
