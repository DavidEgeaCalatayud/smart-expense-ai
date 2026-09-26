from collections.abc import Generator

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


def register(client: TestClient, email: str) -> None:
    response = client.post(
        f"{API_V1}/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery-staple",
            "displayName": "Net Worth Owner",
        },
    )
    assert response.status_code == 201, response.text


def create_account(
    client: TestClient,
    *,
    name: str,
    account_type: str,
    purpose: str,
    balance: str,
    include_in_net_worth: bool = True,
) -> dict[str, object]:
    response = client.post(
        f"{API_V2}/financial-accounts",
        json={
            "name": name,
            "institution": name,
            "accountType": account_type,
            "purpose": purpose,
            "currentBalance": balance,
            "currency": "EUR",
            "includeInNetWorth": include_in_net_worth,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_manual_accounts_aggregate_by_purpose_with_exact_money_strings() -> None:
    with TestClient(app) as client:
        register(client, "net-worth@example.com")
        create_account(
            client,
            name="Trade Republic",
            account_type="broker",
            purpose="opportunities",
            balance="1000.00",
        )
        create_account(
            client,
            name="imagin",
            account_type="checking",
            purpose="daily",
            balance="150.00",
        )
        create_account(
            client,
            name="Bankinter",
            account_type="savings",
            purpose="savings",
            balance="200.00",
        )
        create_account(
            client,
            name="MyInvestor",
            account_type="broker",
            purpose="investment",
            balance="3200.00",
        )

        summary = client.get(f"{API_V2}/net-worth/summary")
        assert summary.status_code == 200
        assert summary.json() == {
            "totalNetWorth": "4550.00",
            "available": "150.00",
            "reserved": "1200.00",
            "invested": "3200.00",
            "daily": "150.00",
            "savings": "200.00",
            "emergencyFund": "0.00",
            "opportunities": "1000.00",
            "investment": "3200.00",
            "other": "0.00",
            "currency": "EUR",
        }

        numeric_balance = client.post(
            f"{API_V2}/financial-accounts",
            json={
                "name": "Invalid numeric money",
                "accountType": "checking",
                "purpose": "daily",
                "currentBalance": 50.0,
                "currency": "EUR",
            },
        )
        assert numeric_balance.status_code == 422


def test_balance_updates_append_snapshots_instead_of_overwriting_history() -> None:
    with TestClient(app) as client:
        register(client, "snapshots@example.com")
        account = create_account(
            client,
            name="Trade Republic",
            account_type="broker",
            purpose="opportunities",
            balance="1000.00",
        )

        updated = client.post(
            f"{API_V2}/financial-accounts/{account['id']}/balance",
            json={"balance": "1250.00"},
        )
        assert updated.status_code == 201, updated.text
        assert updated.json()["balance"] == "1250.00"
        assert updated.json()["source"] == "manual"

        accounts = client.get(f"{API_V2}/financial-accounts").json()
        assert accounts[0]["currentBalance"] == "1250.00"

        with SessionLocal() as db:
            snapshots = db.scalars(
                select(FinancialAccountBalanceSnapshot)
                .where(FinancialAccountBalanceSnapshot.financial_account_id == account["id"])
                .order_by(FinancialAccountBalanceSnapshot.recorded_at.asc())
            ).all()
            assert [f"{snapshot.balance:.2f}" for snapshot in snapshots] == ["1000.00", "1250.00"]

        history = client.get(f"{API_V2}/net-worth/history?months=12")
        assert history.status_code == 200
        values = [point["totalNetWorth"] for point in history.json()["points"]]
        assert values[0] == "1000.00"
        assert values[-1] == "1250.00"
        assert history.json()["changeAmount"] == "250.00"
        assert history.json()["changePercent"] == "25.00"


def test_accounts_are_isolated_and_archiving_removes_them_from_current_net_worth() -> None:
    with TestClient(app) as owner, TestClient(app) as other:
        register(owner, "accounts-owner@example.com")
        private_account = create_account(
            owner,
            name="Private Bank",
            account_type="savings",
            purpose="emergency_fund",
            balance="3000.00",
        )
        create_account(
            owner,
            name="Excluded Wallet",
            account_type="wallet",
            purpose="daily",
            balance="400.00",
            include_in_net_worth=False,
        )

        register(other, "accounts-other@example.com")
        assert other.get(f"{API_V2}/financial-accounts").json() == []
        assert other.get(f"{API_V2}/net-worth/summary").json()["totalNetWorth"] == "0.00"
        assert other.patch(
            f"{API_V2}/financial-accounts/{private_account['id']}",
            json={"name": "Stolen"},
        ).status_code == 404

        before_archive = owner.get(f"{API_V2}/net-worth/summary").json()
        assert before_archive["totalNetWorth"] == "3000.00"
        assert before_archive["emergencyFund"] == "3000.00"

        archived = owner.delete(f"{API_V2}/financial-accounts/{private_account['id']}")
        assert archived.status_code == 204
        assert owner.get(f"{API_V2}/financial-accounts").json()[0]["name"] == "Excluded Wallet"
        assert owner.get(f"{API_V2}/net-worth/summary").json()["totalNetWorth"] == "0.00"

        archived_balance = owner.post(
            f"{API_V2}/financial-accounts/{private_account['id']}/balance",
            json={"balance": "3500.00"},
        )
        assert archived_balance.status_code == 404

        archived_rows = owner.get(f"{API_V2}/financial-accounts?includeArchived=true").json()
        restored = next(item for item in archived_rows if item["id"] == private_account["id"])
        assert restored["archived"] is True
        assert restored["currentBalance"] == "3000.00"


def test_patch_rejects_explicit_null_for_required_metadata() -> None:
    with TestClient(app) as client:
        register(client, "null-patch@example.com")
        account = create_account(
            client,
            name="Bankinter",
            account_type="checking",
            purpose="daily",
            balance="200.00",
        )

        response = client.patch(
            f"{API_V2}/financial-accounts/{account['id']}",
            json={"purpose": None},
        )
        assert response.status_code == 422
        assert client.get(f"{API_V2}/financial-accounts").json()[0]["purpose"] == "daily"
