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


def register(client: TestClient, email: str) -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery-staple",
            "displayName": "Privacy Net Worth Owner",
        },
    )
    assert response.status_code == 201, response.text


def create_account(client: TestClient, name: str, balance: str) -> dict[str, object]:
    response = client.post(
        "/api/v2/financial-accounts",
        json={
            "name": name,
            "institution": name,
            "accountType": "savings",
            "purpose": "emergency_fund",
            "currentBalance": balance,
            "currency": "EUR",
            "includeInNetWorth": True,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_privacy_export_contains_only_owner_financial_accounts_and_balance_history() -> None:
    with TestClient(app) as owner, TestClient(app) as other:
        register(owner, "privacy-money-owner@example.com")
        owner_account = create_account(owner, "Owner Bank", "1000.00")
        updated = owner.post(
            f"/api/v2/financial-accounts/{owner_account['id']}/balance",
            json={"balance": "1250.00"},
        )
        assert updated.status_code == 201, updated.text

        register(other, "privacy-money-other@example.com")
        other_account = create_account(other, "Other Secret Bank", "9999.00")

        response = owner.get("/api/v1/auth/privacy-export")
        assert response.status_code == 200, response.text
        payload = response.json()

        assert len(payload["financialAccounts"]) == 1
        exported_account = payload["financialAccounts"][0]
        assert exported_account["id"] == owner_account["id"]
        assert exported_account["name"] == "Owner Bank"
        assert exported_account["currentBalance"] == "1250.00"
        assert exported_account["purpose"] == "emergency_fund"

        snapshots = payload["financialAccountBalanceSnapshots"]
        assert [item["balance"] for item in snapshots] == ["1000.00", "1250.00"]
        assert {item["financialAccountId"] for item in snapshots} == {owner_account["id"]}
        assert all(item["source"] == "manual" for item in snapshots)

        serialized = response.text
        assert "Other Secret Bank" not in serialized
        assert str(other_account["id"]) not in serialized
        assert "9999.00" not in serialized
        assert "privacy-money-other@example.com" not in serialized


def test_privacy_export_contains_only_owner_investment_positions_and_movements() -> None:
    with TestClient(app) as owner, TestClient(app) as other:
        register(owner, "privacy-investments-owner@example.com")
        owner_broker = owner.post(
            "/api/v2/financial-accounts",
            json={
                "name": "MyInvestor",
                "institution": "MyInvestor",
                "accountType": "broker",
                "purpose": "investment",
                "currentBalance": "0.00",
                "currency": "EUR",
                "includeInNetWorth": True,
            },
        )
        assert owner_broker.status_code == 201, owner_broker.text
        owner_position = owner.post(
            "/api/v2/investments/positions",
            json={
                "financialAccountId": owner_broker.json()["id"],
                "name": "JPM Korea Equity",
                "isin": "LU0301637293",
                "units": "1.25000000",
                "costTotal": "33.92",
                "currency": "EUR",
            },
        )
        assert owner_position.status_code == 201, owner_position.text
        owner_update = owner.put(
            f"/api/v2/investments/positions/{owner_position.json()['id']}/holdings",
            json={
                "units": "1.50000000",
                "costTotal": "40.00",
                "movementType": "contribution",
                "note": "Owner-only October contribution",
            },
        )
        assert owner_update.status_code == 200, owner_update.text

        register(other, "privacy-investments-other@example.com")
        other_broker = other.post(
            "/api/v2/financial-accounts",
            json={
                "name": "Other Secret Broker",
                "institution": "Other Secret Broker",
                "accountType": "broker",
                "purpose": "investment",
                "currentBalance": "0.00",
                "currency": "EUR",
                "includeInNetWorth": True,
            },
        )
        assert other_broker.status_code == 201, other_broker.text
        other_position = other.post(
            "/api/v2/investments/positions",
            json={
                "financialAccountId": other_broker.json()["id"],
                "name": "Other Secret Fund",
                "isin": "IE00BYX5MX67",
                "units": "99.00000000",
                "costTotal": "9999.00",
                "currency": "EUR",
            },
        )
        assert other_position.status_code == 201, other_position.text

        response = owner.get("/api/v1/auth/privacy-export")
        assert response.status_code == 200, response.text
        payload = response.json()

        positions = payload["investmentPositions"]
        assert len(positions) == 1
        assert positions[0]["id"] == owner_position.json()["id"]
        assert positions[0]["financialAccountId"] == owner_broker.json()["id"]
        assert positions[0]["name"] == "JPM Korea Equity"
        assert positions[0]["isin"] == "LU0301637293"
        assert positions[0]["units"] == "1.50000000"
        assert positions[0]["costTotal"] == "40.00"

        movements = payload["investmentPositionMovements"]
        assert [item["movementType"] for item in movements] == ["initial", "contribution"]
        assert [item["unitsAfter"] for item in movements] == ["1.25000000", "1.50000000"]
        assert movements[1]["note"] == "Owner-only October contribution"

        serialized = response.text
        assert "Other Secret Broker" not in serialized
        assert "Other Secret Fund" not in serialized
        assert str(other_position.json()["id"]) not in serialized
        assert "9999.00" not in serialized
        assert "privacy-investments-other@example.com" not in serialized
