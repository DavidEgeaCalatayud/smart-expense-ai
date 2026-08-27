from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.db.session import SessionLocal, engine
from app.main import app
from app.models.category_suggestion import CategorySuggestion
from app.models.transaction import Transaction
from app.models.user import User


pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def clean_account_data() -> Generator[None, None, None]:
    with engine.begin() as connection:
        connection.execute(delete(CategorySuggestion))
        connection.execute(delete(Transaction))
        connection.execute(delete(User))
    yield
    with engine.begin() as connection:
        connection.execute(delete(CategorySuggestion))
        connection.execute(delete(Transaction))
        connection.execute(delete(User))


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client


def register(client: TestClient, email: str = "suggestions@example.com") -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery-staple",
            "displayName": "Suggestion Owner",
        },
    )
    assert response.status_code == 201


def transaction_payload(category: str, merchant: str = "MERCADONA 3921") -> dict[str, object]:
    return {
        "merchant": merchant,
        "description": "Suggestion integration test",
        "category": category,
        "amount": "42.50",
        "date": "2026-08-27",
        "type": "expense",
        "paymentMethod": "card",
        "isRecurring": False,
    }


def test_preview_exposes_category_without_uncalibrated_confidence(client: TestClient) -> None:
    register(client)

    response = client.post(
        "/api/v2/category-suggestions/preview",
        json={"merchant": "MERCADONA 3921", "type": "expense"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["categoryName"] == "Food"
    assert body["source"] == "global_model"
    assert body["modelVersion"] == "tfidf-logreg-v1"
    assert body["featurePolicy"] == "merchant_descriptor_only_v1"
    assert "confidence" not in body
    assert "probabilities" not in body


def test_v2_write_persists_correction_and_reuses_it_for_same_user(client: TestClient) -> None:
    register(client)
    custom = client.post(
        "/api/v1/categories",
        json={"name": "Groceries", "transactionType": "expense"},
    )
    assert custom.status_code == 201
    custom_id = custom.json()["id"]

    created = client.post(
        "/api/v2/transactions",
        json=transaction_payload("Groceries"),
    )
    assert created.status_code == 201

    with SessionLocal() as db:
        feedback = db.scalar(select(CategorySuggestion))
        assert feedback is not None
        assert feedback.source == "global_model"
        assert feedback.accepted is False
        assert feedback.corrected_at is not None
        assert str(feedback.selected_category_id) == custom_id
        assert feedback.merchant_key == "mercadona"

    personalized = client.post(
        "/api/v2/category-suggestions/preview",
        json={"merchant": "Mercadona 9999", "type": "expense"},
    )
    assert personalized.status_code == 200
    body = personalized.json()
    assert body["categoryName"] == "Groceries"
    assert body["categoryId"] == custom_id
    assert body["source"] == "user_history"
    assert body["modelVersion"] == "user-merchant-history-v1"


def test_personalization_is_isolated_per_user(client: TestClient) -> None:
    register(client, "first-suggestions@example.com")
    created = client.post(
        "/api/v2/transactions",
        json=transaction_payload("Transport", "MERCADONA 1001"),
    )
    assert created.status_code == 201

    other_client = TestClient(app)
    try:
        register(other_client, "second-suggestions@example.com")
        response = other_client.post(
            "/api/v2/category-suggestions/preview",
            json={"merchant": "MERCADONA 1002", "type": "expense"},
        )
        assert response.status_code == 200
        assert response.json()["categoryName"] == "Food"
        assert response.json()["source"] == "global_model"
    finally:
        other_client.close()
