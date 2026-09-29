from collections.abc import Generator
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.db.session import SessionLocal, engine
from app.main import app
from app.models.financial_account import FinancialAccount, FinancialAccountBalanceSnapshot
from app.models.user import User


pytestmark = pytest.mark.integration
API_V1 = "/api/v1"
API_V2 = "/api/v2"


@pytest.fixture(autouse=True)
def clean_financial_account_data() -> Generator[None, None, None]:
    with engine.begin() as connection:
        connection.execute(delete(FinancialAccountBalanceSnapshot))
        connection.execute(delete(FinancialAccount))
        connection.execute(delete(User))
    yield
    with engine.begin() as connection:
        connection.execute(delete(FinancialAccountBalanceSnapshot))
        connection.execute(delete(FinancialAccount))
        connection.execute(delete(User))


def register(client: TestClient) -> None:
    response = client.post(
        f"{API_V1}/auth/register",
        json={
            "email": "atomic-money-edit@example.com",
            "password": "correct-horse-battery-staple",
            "displayName": "Atomic Money Owner",
        },
    )
    assert response.status_code == 201, response.text


def create_account(client: TestClient) -> dict[str, object]:
    response = client.post(
        f"{API_V2}/financial-accounts",
        json={
            "name": "Trade Republic",
            "institution": "Trade Republic",
            "accountType": "broker",
            "purpose": "opportunities",
            "currentBalance": "1000.00",
            "currency": "EUR",
            "includeInNetWorth": True,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_combined_metadata_balance_and_inclusion_edit_commits_one_snapshot() -> None:
    with TestClient(app) as client:
        register(client)
        account = create_account(client)
        account_id = UUID(str(account["id"]))

        response = client.patch(
            f"{API_V2}/financial-accounts/{account_id}",
            json={
                "name": "TR inversión",
                "institution": "Trade Republic",
                "accountType": "broker",
                "purpose": "daily",
                "currentBalance": "1250.75",
                "includeInNetWorth": False,
            },
        )
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["name"] == "TR inversión"
        assert payload["currentBalance"] == "1250.75"
        assert payload["purpose"] == "investment"
        assert payload["includeInNetWorth"] is False

        with SessionLocal() as db:
            snapshots = list(
                db.scalars(
                    select(FinancialAccountBalanceSnapshot)
                    .where(FinancialAccountBalanceSnapshot.financial_account_id == account_id)
                    .order_by(FinancialAccountBalanceSnapshot.recorded_at.asc())
                ).all()
            )
            assert len(snapshots) == 2
            latest = snapshots[-1]
            assert f"{latest.balance:.2f}" == "1250.75"
            assert latest.include_in_net_worth is False
            assert latest.archived is False


def test_invalid_balance_rejects_entire_edit_before_metadata_can_commit() -> None:
    with TestClient(app) as client:
        register(client)
        account = create_account(client)

        response = client.patch(
            f"{API_V2}/financial-accounts/{account['id']}",
            json={
                "name": "This must not persist",
                "currentBalance": "123.456",
            },
        )
        assert response.status_code == 422

        stored = client.get(f"{API_V2}/financial-accounts").json()[0]
        assert stored["name"] == "Trade Republic"
        assert stored["currentBalance"] == "1000.00"


def test_existing_broker_cannot_drift_out_of_investment_when_type_is_omitted() -> None:
    with TestClient(app) as client:
        register(client)
        account = create_account(client)

        response = client.patch(
            f"{API_V2}/financial-accounts/{account['id']}",
            json={"purpose": "opportunities"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["accountType"] == "broker"
        assert response.json()["purpose"] == "investment"
