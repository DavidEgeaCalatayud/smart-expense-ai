from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.db.session import engine
from app.main import app
from app.models.transaction import Transaction as TransactionModel
from app.models.user import User


pytestmark = pytest.mark.integration
AUTH_API = "/api/v1"
MONEY_API = "/api/v2"


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


def register(client: TestClient, email: str) -> None:
    response = client.post(
        f"{AUTH_API}/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery-staple",
            "displayName": "Forecast Owner",
        },
    )
    assert response.status_code == 201


def create_expense(client: TestClient, amount: str, value: str) -> None:
    response = client.post(
        f"{MONEY_API}/transactions",
        json={
            "merchant": "Forecast Market",
            "description": "Forecast API fixture",
            "category": "Shopping",
            "amount": amount,
            "date": value,
            "type": "expense",
            "paymentMethod": "card",
            "isRecurring": False,
        },
    )
    assert response.status_code == 201


def test_spending_forecast_requires_authentication(client: TestClient) -> None:
    response = client.get(f"{MONEY_API}/analytics/spending-forecast")
    assert response.status_code == 401


def test_spending_forecast_is_decimal_safe_causal_and_user_scoped(client: TestClient) -> None:
    register(client, "forecast-owner@example.com")
    for amount, value in [
        ("300.00", "2026-01-05"),
        ("300.00", "2026-02-05"),
        ("300.00", "2026-03-05"),
        ("100.00", "2026-04-10"),
        # Exists in persistence, but is after asOf and must not affect the forecast.
        ("9999.00", "2026-04-20"),
    ]:
        create_expense(client, amount, value)

    response = client.get(
        f"{MONEY_API}/analytics/spending-forecast?asOf=2026-04-10"
    )
    assert response.status_code == 200
    report = response.json()
    assert report["forecastVersion"] == "spending-forecast-v1"
    assert report["asOf"] == "2026-04-10"
    assert report["spentSoFar"] == "100.00"
    assert report["historicalThreeMonthMean"] == "300.00"
    assert report["backtestCutoffDay"] == 15
    assert all(item["backtest"]["support"] == report["backtestMonths"] for item in report["baselines"])

    by_id = {item["baseline"]: item for item in report["baselines"]}
    assert by_id["three_month_mean"]["projectedMonthEnd"] == "300.00"
    assert by_id["run_rate"]["projectedMonthEnd"] == "300.00"
    assert "9999.00" not in str(report)

    client.post(f"{AUTH_API}/auth/logout")
    register(client, "forecast-other@example.com")
    other = client.get(
        f"{MONEY_API}/analytics/spending-forecast?asOf=2026-04-10"
    )
    assert other.status_code == 200
    assert other.json()["spentSoFar"] == "0.00"
    assert other.json()["historicalThreeMonthMean"] is None
