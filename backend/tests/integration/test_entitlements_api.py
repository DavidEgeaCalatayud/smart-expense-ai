from collections.abc import Generator
from datetime import datetime, timezone
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.db.session import engine
from app.main import app
from app.models.user import User


pytestmark = pytest.mark.integration
API_V1 = "/api/v1"
API_V2 = "/api/v2"
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


def register(client: TestClient, email: str = "entitlements@example.com") -> UUID:
    response = client.post(
        f"{API_V1}/auth/register",
        json={
            "email": email,
            "password": PASSWORD,
            "displayName": "Entitlements Owner",
        },
    )
    assert response.status_code == 201
    return UUID(response.json()["user"]["id"])


def test_entitlements_require_authentication(client: TestClient) -> None:
    response = client.get(f"{API_V2}/entitlements")

    assert response.status_code == 401


def test_new_account_gets_observe_only_free_policy(client: TestClient) -> None:
    register(client)

    response = client.get(f"{API_V2}/entitlements")

    assert response.status_code == 200
    assert response.json() == {
        "policyVersion": "premium-entitlements-v1",
        "enforcementMode": "observe_only",
        "planTier": "free",
        "subscriptionStatus": "none",
        "subscriptionCurrentPeriodEnd": None,
        "limits": {
            "maxCsvImportsPerMonth": 5,
            "maxCustomCategories": 25,
            "maxBudgetsPerMonth": 25,
            "maxHistoricalWindowMonths": 12,
            "maxAssistantQueriesPerDay": 20,
        },
        "features": {
            "advancedInsights": {
                "eligible": False,
                "enabled": False,
            },
            "exportableReports": {
                "eligible": False,
                "enabled": False,
            },
        },
    }


def test_premium_account_gets_released_reports_and_advanced_insights(
    client: TestClient,
) -> None:
    user_id = register(client, "premium-entitlements@example.com")
    period_end = datetime(2027, 2, 1, 12, 0, tzinfo=timezone.utc)

    with Session(engine) as db:
        user = db.get(User, user_id)
        assert user is not None
        user.plan_tier = "premium"
        user.subscription_status = "active"
        user.subscription_current_period_end = period_end
        db.commit()

    response = client.get(f"{API_V2}/entitlements")

    assert response.status_code == 200
    payload = response.json()
    assert payload["planTier"] == "premium"
    assert payload["subscriptionStatus"] == "active"
    assert payload["subscriptionCurrentPeriodEnd"] == period_end.isoformat().replace("+00:00", "Z")
    assert payload["limits"] == {
        "maxCsvImportsPerMonth": 100,
        "maxCustomCategories": 250,
        "maxBudgetsPerMonth": 250,
        "maxHistoricalWindowMonths": 60,
        "maxAssistantQueriesPerDay": 200,
    }
    assert payload["features"] == {
        "advancedInsights": {
            "eligible": True,
            "enabled": True,
        },
        "exportableReports": {
            "eligible": True,
            "enabled": True,
        },
    }

    privacy_response = client.get(f"{API_V1}/auth/privacy-export")
    assert privacy_response.status_code == 200
    assert privacy_response.json()["subscription"] == {
        "planTier": "premium",
        "subscriptionStatus": "active",
        "subscriptionCurrentPeriodEnd": period_end.isoformat().replace("+00:00", "Z"),
    }
