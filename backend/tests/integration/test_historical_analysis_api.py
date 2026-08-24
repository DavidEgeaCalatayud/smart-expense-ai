from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.db.session import engine
from app.main import app
from app.models.historical_analysis import HistoricalAnalysisSnapshot
from app.models.intelligence import IntelligenceFinding, IntelligenceScan
from app.models.transaction import Transaction as TransactionModel
from app.models.user import User


pytestmark = pytest.mark.integration
AUTH_API = "/api/v1"
MONEY_API = "/api/v2"


@pytest.fixture(autouse=True)
def clean_account_data() -> Generator[None, None, None]:
    with engine.begin() as connection:
        connection.execute(delete(HistoricalAnalysisSnapshot))
        connection.execute(delete(IntelligenceScan))
        connection.execute(delete(IntelligenceFinding))
        connection.execute(delete(TransactionModel))
        connection.execute(delete(User))

    yield

    with engine.begin() as connection:
        connection.execute(delete(HistoricalAnalysisSnapshot))
        connection.execute(delete(IntelligenceScan))
        connection.execute(delete(IntelligenceFinding))
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
            "displayName": "Historical Analyst",
        },
    )
    assert response.status_code == 201


def create_expense(client: TestClient, merchant: str, amount: str, value: str, category: str = "Subscriptions") -> None:
    response = client.post(
        f"{MONEY_API}/transactions",
        json={
            "merchant": merchant,
            "description": "Historical analysis fixture",
            "category": category,
            "amount": amount,
            "date": value,
            "type": "expense",
            "paymentMethod": "card",
            "isRecurring": False,
        },
    )
    assert response.status_code == 201


def seed_history(client: TestClient) -> None:
    for merchant, amount, value, category in [
        ("Stream Box SL", "20.00", "2026-01-05", "Subscriptions"),
        ("STREAM BOX*2002", "20.00", "2026-02-04", "Subscriptions"),
        ("Stream Box", "20.50", "2026-03-06", "Subscriptions"),
        ("Stream Box", "20.00", "2026-04-05", "Subscriptions"),
        ("Stream Box", "20.00", "2026-05-05", "Subscriptions"),
        ("Stream Box", "20.25", "2026-06-04", "Subscriptions"),
        ("Cloud Tools", "10.00", "2026-01-10", "Shopping"),
        ("Cloud Tools SL", "11.00", "2026-02-10", "Shopping"),
        ("CLOUD TOOLS*3003", "9.00", "2026-03-10", "Shopping"),
        ("Cloud Tools", "10.00", "2026-04-10", "Shopping"),
        ("Cloud Tools", "80.00", "2026-05-10", "Shopping"),
    ]:
        create_expense(client, merchant, amount, value, category)


def test_historical_analysis_requires_authentication(client: TestClient) -> None:
    assert client.post(f"{MONEY_API}/intelligence/historical-analysis").status_code == 401
    assert client.get(f"{MONEY_API}/intelligence/historical-analysis/latest").status_code == 401


def test_historical_analysis_is_persisted_versioned_and_user_scoped(client: TestClient) -> None:
    register(client, "history-owner@example.com")
    seed_history(client)

    response = client.post(f"{MONEY_API}/intelligence/historical-analysis?months=6")
    assert response.status_code == 200
    analysis = response.json()
    assert analysis["analysisVersion"] == "historical-v2"
    assert analysis["windowMonths"] == 6
    assert analysis["analyzedTransactions"] == 11
    assert analysis["coverage"]["transactionCount"] == 11
    assert analysis["coverage"]["activeMonths"] == 5
    assert analysis["coverage"]["partialMonthsExcluded"] == 1
    assert analysis["monthlySpend"][0]["amount"] == "30.00"
    assert analysis["monthCompleteness"]["strategy"] == "exclude_partial"
    assert analysis["monthCompleteness"]["partialMonth"] == "2026-06"
    assert analysis["trend"]["excludedPartialMonth"] == "2026-06"
    assert analysis["monthlySpend"][-1]["isComplete"] is False
    stream_profile = next(
        profile for profile in analysis["recurringProfiles"]
        if profile["canonicalMerchant"] == "stream box"
    )
    assert {"Stream Box SL", "STREAM BOX*2002"}.issubset(set(stream_profile["observedMerchants"]))
    cloud_outlier = next(outlier for outlier in analysis["outliers"] if outlier["merchant"] == "Cloud Tools")
    assert cloud_outlier["canonicalMerchant"] == "cloud tools"

    latest = client.get(f"{MONEY_API}/intelligence/historical-analysis/latest")
    assert latest.status_code == 200
    assert latest.json()["snapshotId"] == analysis["snapshotId"]

    client.post(f"{AUTH_API}/auth/logout")
    register(client, "history-other@example.com")
    missing = client.get(f"{MONEY_API}/intelligence/historical-analysis/latest")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "historical_analysis_not_found"


def test_historical_analysis_validates_window_bounds(client: TestClient) -> None:
    register(client, "history-owner@example.com")
    too_short = client.post(f"{MONEY_API}/intelligence/historical-analysis?months=3")
    assert too_short.status_code == 422
    assert too_short.json()["error"]["code"] == "validation_error"
