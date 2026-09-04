from collections.abc import Generator
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.db.session import engine
from app.main import app
from app.models.user import User


pytestmark = pytest.mark.integration
PASSWORD = "correct-horse-battery-staple"


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


def register(client: TestClient, email: str) -> UUID:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": PASSWORD,
            "displayName": "Advanced Insights Owner",
        },
    )
    assert response.status_code == 201
    return UUID(response.json()["user"]["id"])


def make_premium(user_id: UUID) -> None:
    with Session(engine) as db:
        user = db.get(User, user_id)
        assert user is not None
        user.plan_tier = "premium"
        user.subscription_status = "active"
        db.commit()


def transaction_payload(
    *, merchant: str, amount: str, category: str, transaction_type: str, transaction_date: str
) -> dict[str, object]:
    return {
        "merchant": merchant,
        "description": "Advanced insights integration test",
        "category": category,
        "amount": amount,
        "date": transaction_date,
        "type": transaction_type,
        "paymentMethod": "card",
        "isRecurring": False,
    }


def metrics_by_kind(payload: dict[str, object]) -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {}
    for card in payload["insights"]:  # type: ignore[index]
        card_payload = card  # type: ignore[assignment]
        metrics: dict[str, str] = {}
        for evidence in card_payload["evidence"]:
            for metric in evidence["metrics"]:
                metrics[metric["key"]] = metric["value"]
        result[card_payload["kind"]] = metrics
    return result


def test_advanced_insights_require_authentication(client: TestClient) -> None:
    response = client.get("/api/v2/insights/advanced?month=2026-09")
    assert response.status_code == 401


def test_free_account_cannot_use_advanced_insights(client: TestClient) -> None:
    register(client, "free-insights@example.com")

    entitlements = client.get("/api/v2/entitlements")
    assert entitlements.status_code == 200
    assert entitlements.json()["features"]["advancedInsights"] == {
        "eligible": False,
        "enabled": False,
    }

    response = client.get("/api/v2/insights/advanced?month=2026-09")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "premium_feature_required"


def test_premium_insights_compose_exact_account_evidence(client: TestClient) -> None:
    user_id = register(client, "premium-insights@example.com")
    make_premium(user_id)

    transactions = [
        transaction_payload(
            merchant="August Food",
            amount="50.00",
            category="Food",
            transaction_type="expense",
            transaction_date="2026-08-10",
        ),
        transaction_payload(
            merchant="September Food",
            amount="80.00",
            category="Food",
            transaction_type="expense",
            transaction_date="2026-09-05",
        ),
        transaction_payload(
            merchant="September Metro",
            amount="20.00",
            category="Transport",
            transaction_type="expense",
            transaction_date="2026-09-06",
        ),
        transaction_payload(
            merchant="September Salary",
            amount="200.00",
            category="Salary",
            transaction_type="income",
            transaction_date="2026-09-01",
        ),
    ]
    for transaction in transactions:
        response = client.post("/api/v2/transactions", json=transaction)
        assert response.status_code == 201

    budget = client.post(
        "/api/v2/budgets",
        json={"month": "2026-09", "categoryId": None, "limitAmount": "90.00"},
    )
    assert budget.status_code == 201

    response = client.get("/api/v2/insights/advanced?month=2026-09")
    assert response.status_code == 200
    payload = response.json()
    assert payload["insightVersion"] == "advanced-financial-insights-v1"
    assert payload["month"] == "2026-09"
    assert payload["currency"] == "EUR"
    assert payload["sourceContracts"]["monthlyReport"] == "monthly-financial-report-v1"
    assert payload["sourceContracts"]["intelligenceRules"] == "rules-v2"
    assert len(payload["limitations"]) == 3

    metrics = metrics_by_kind(payload)
    assert metrics["cash_flow"] == {
        "totalIncome": "200.00",
        "totalExpenses": "100.00",
        "net": "100.00",
        "transactionCount": "3",
    }
    assert metrics["expense_change"] == {
        "currentExpenses": "100.00",
        "previousExpenses": "50.00",
        "expenseDelta": "50.00",
        "expenseChangePercent": "100.0",
    }
    assert metrics["category_concentration"] == {
        "category": "Food",
        "amount": "80.00",
        "share": "80.0",
        "transactionCount": "1",
    }
    assert metrics["budget_pressure"]["budgetCount"] == "1"
    assert metrics["budget_pressure"]["overBudgetCount"] == "1"
    assert metrics["budget_pressure"]["highestPercentUsed"] == "111.1"
    assert metrics["open_findings"]["openCount"] == "0"

    priorities = {item["kind"]: item["priority"] for item in payload["insights"]}
    assert priorities["budget_pressure"] == "attention"
    assert priorities["expense_change"] == "attention"
    assert priorities["cash_flow"] == "positive"
    assert priorities["category_concentration"] == "info"


def test_advanced_insights_are_account_isolated_and_validate_month(client: TestClient) -> None:
    first_user_id = register(client, "first-insights@example.com")
    make_premium(first_user_id)
    response = client.post(
        "/api/v2/transactions",
        json=transaction_payload(
            merchant="First Account Only",
            amount="999.00",
            category="Food",
            transaction_type="expense",
            transaction_date="2026-09-03",
        ),
    )
    assert response.status_code == 201

    assert client.post("/api/v1/auth/logout").status_code == 204
    second_user_id = register(client, "second-insights@example.com")
    make_premium(second_user_id)
    response = client.post(
        "/api/v2/transactions",
        json=transaction_payload(
            merchant="Second Account Only",
            amount="10.00",
            category="Food",
            transaction_type="expense",
            transaction_date="2026-09-04",
        ),
    )
    assert response.status_code == 201

    response = client.get("/api/v2/insights/advanced?month=2026-09")
    assert response.status_code == 200
    metrics = metrics_by_kind(response.json())
    assert metrics["cash_flow"]["totalExpenses"] == "10.00"
    assert "999.00" not in str(response.json())

    invalid = client.get("/api/v2/insights/advanced?month=2026-13")
    assert invalid.status_code == 422
