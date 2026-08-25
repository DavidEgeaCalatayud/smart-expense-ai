from collections.abc import Generator
from datetime import date
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import engine
from app.main import app
from app.models.historical_analysis import HistoricalAnalysisSnapshot
from app.models.intelligence import IntelligenceFinding, IntelligenceScan
from app.models.transaction import Transaction as TransactionModel
from app.models.user import User


pytestmark = pytest.mark.integration
API = "/api/v1"
PASSWORD = "correct-horse-battery-staple"
NEW_PASSWORD = "new-correct-horse-battery-staple"


@pytest.fixture(autouse=True)
def clean_account_data() -> Generator[None, None, None]:
    with engine.begin() as connection:
        connection.execute(delete(User))

    yield

    with engine.begin() as connection:
        connection.execute(delete(User))


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client


def register(client: TestClient, email: str = "owner@example.com") -> dict[str, object]:
    response = client.post(
        f"{API}/auth/register",
        json={
            "email": email,
            "password": PASSWORD,
            "displayName": "Privacy Owner",
        },
    )
    assert response.status_code == 201
    return response.json()


def create_transaction(client: TestClient, merchant: str) -> dict[str, object]:
    response = client.post(
        f"{API}/transactions",
        json={
            "merchant": merchant,
            "description": "Privacy integration fixture",
            "category": "Food",
            "amount": 42.50,
            "date": "2026-08-24",
            "type": "expense",
            "paymentMethod": "card",
            "isRecurring": False,
        },
    )
    assert response.status_code == 201
    return response.json()


def test_password_change_revokes_previous_tokens_and_rotates_current_session(
    client: TestClient,
) -> None:
    register(client)
    old_token = client.cookies.get(settings.auth_cookie_name)
    assert old_token

    response = client.put(
        f"{API}/auth/password",
        json={"currentPassword": PASSWORD, "newPassword": NEW_PASSWORD},
    )

    assert response.status_code == 204
    new_token = client.cookies.get(settings.auth_cookie_name)
    assert new_token and new_token != old_token
    assert client.get(f"{API}/auth/me").status_code == 200

    with TestClient(app) as stale_client:
        stale_client.cookies.set(settings.auth_cookie_name, old_token)
        assert stale_client.get(f"{API}/auth/me").status_code == 401

    client.post(f"{API}/auth/logout")
    old_login = client.post(
        f"{API}/auth/login",
        json={"email": "owner@example.com", "password": PASSWORD},
    )
    assert old_login.status_code == 401

    new_login = client.post(
        f"{API}/auth/login",
        json={"email": "owner@example.com", "password": NEW_PASSWORD},
    )
    assert new_login.status_code == 200


def test_password_change_requires_current_password_and_rejects_reuse(client: TestClient) -> None:
    register(client)

    wrong_current = client.put(
        f"{API}/auth/password",
        json={"currentPassword": "wrong-password", "newPassword": NEW_PASSWORD},
    )
    assert wrong_current.status_code == 403

    reused = client.put(
        f"{API}/auth/password",
        json={"currentPassword": PASSWORD, "newPassword": PASSWORD},
    )
    assert reused.status_code == 400
    assert client.get(f"{API}/auth/me").status_code == 200


def test_privacy_export_is_exactly_scoped_and_contains_no_credentials(client: TestClient) -> None:
    register(client)
    create_transaction(client, "Owner Market")

    with TestClient(app) as other_client:
        register(other_client, "other@example.com")
        create_transaction(other_client, "Other Market")

    response = client.get(f"{API}/auth/privacy-export")

    assert response.status_code == 200
    export = response.json()
    assert export["schemaVersion"] == "privacy-export-v1"
    assert export["account"]["email"] == "owner@example.com"
    assert [item["merchant"] for item in export["transactions"]] == ["Owner Market"]
    assert export["transactions"][0]["amount"] == "42.50"

    serialized = response.text
    assert "Other Market" not in serialized
    assert "other@example.com" not in serialized
    assert PASSWORD not in serialized
    assert "password_hash" not in serialized
    assert "session_version" not in serialized


def test_account_deletion_requires_confirmation_and_cascades_all_user_data(
    client: TestClient,
) -> None:
    registered = register(client)
    user_id = UUID(str(registered["user"]["id"]))
    create_transaction(client, "Delete Me Market")

    with Session(engine) as db:
        db.add(
            IntelligenceFinding(
                user_id=user_id,
                finding_type="spending_anomaly",
                severity="warning",
                status="open",
                fingerprint="delete-me-finding",
                rule_version="rules-v2",
                title="Delete fixture",
                explanation="Owned finding must cascade with the user.",
                evidence={"fixture": True},
            )
        )
        db.add(
            IntelligenceScan(
                user_id=user_id,
                rule_version="rules-v2",
                transaction_count=1,
                finding_count=1,
            )
        )
        db.add(
            HistoricalAnalysisSnapshot(
                user_id=user_id,
                analysis_version="historical-v2.2",
                window_months=6,
                transaction_count=1,
                period_start=date(2026, 3, 1),
                period_end=date(2026, 8, 24),
                result={"fixture": True},
            )
        )
        db.commit()

    wrong_confirmation = client.request(
        "DELETE",
        f"{API}/auth/account",
        json={"password": PASSWORD, "confirmation": "delete"},
    )
    assert wrong_confirmation.status_code == 422

    wrong_password = client.request(
        "DELETE",
        f"{API}/auth/account",
        json={"password": "wrong-password", "confirmation": "DELETE"},
    )
    assert wrong_password.status_code == 403

    response = client.request(
        "DELETE",
        f"{API}/auth/account",
        json={"password": PASSWORD, "confirmation": "DELETE"},
    )
    assert response.status_code == 204
    assert settings.auth_cookie_name not in client.cookies
    assert client.get(f"{API}/auth/me").status_code == 401

    with Session(engine) as db:
        assert db.get(User, user_id) is None
        assert db.scalar(select(func.count()).select_from(TransactionModel).where(TransactionModel.user_id == user_id)) == 0
        assert db.scalar(select(func.count()).select_from(IntelligenceFinding).where(IntelligenceFinding.user_id == user_id)) == 0
        assert db.scalar(select(func.count()).select_from(IntelligenceScan).where(IntelligenceScan.user_id == user_id)) == 0
        assert db.scalar(select(func.count()).select_from(HistoricalAnalysisSnapshot).where(HistoricalAnalysisSnapshot.user_id == user_id)) == 0
