from collections.abc import Generator
from datetime import datetime, timedelta, timezone
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


def move_initial_snapshots_to(account_ids: list[UUID], recorded_at: datetime) -> None:
    with SessionLocal() as db:
        snapshots = db.scalars(
            select(FinancialAccountBalanceSnapshot).where(
                FinancialAccountBalanceSnapshot.financial_account_id.in_(account_ids)
            )
        ).all()
        for snapshot in snapshots:
            snapshot.recorded_at = recorded_at
        db.commit()


def test_manual_accounts_aggregate_by_purpose_with_exact_money_strings() -> None:
    with TestClient(app) as client:
        register(client, "net-worth@example.com")
        trade_republic = create_account(
            client,
            name="Trade Republic",
            account_type="broker",
            purpose="opportunities",
            balance="1000.00",
        )
        # Broker accounts are intentionally normalized to investment even when a caller
        # supplies another purpose. This keeps investment platforms in Invertido.
        assert trade_republic["purpose"] == "investment"
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
            "reserved": "200.00",
            "invested": "4200.00",
            "daily": "150.00",
            "savings": "200.00",
            "emergencyFund": "0.00",
            "opportunities": "0.00",
            "investment": "4200.00",
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


def test_balance_updates_append_snapshots_and_history_is_daily() -> None:
    with TestClient(app) as client:
        register(client, "snapshots@example.com")
        account = create_account(
            client,
            name="Trade Republic",
            account_type="broker",
            purpose="opportunities",
            balance="1000.00",
        )
        account_id = UUID(str(account["id"]))
        move_initial_snapshots_to(
            [account_id],
            datetime.now(timezone.utc) - timedelta(days=2),
        )

        updated = client.post(
            f"{API_V2}/financial-accounts/{account_id}/balance",
            json={"balance": "1250.00"},
        )
        assert updated.status_code == 201, updated.text
        assert updated.json()["balance"] == "1250.00"
        assert updated.json()["source"] == "manual"
        assert updated.json()["includeInNetWorth"] is True
        assert updated.json()["archived"] is False

        # Two changes on the same day must collapse into the final daily total.
        second = client.post(
            f"{API_V2}/financial-accounts/{account_id}/balance",
            json={"balance": "1300.00"},
        )
        assert second.status_code == 201, second.text

        accounts = client.get(f"{API_V2}/financial-accounts").json()
        assert accounts[0]["currentBalance"] == "1300.00"

        with SessionLocal() as db:
            snapshots = db.scalars(
                select(FinancialAccountBalanceSnapshot)
                .where(FinancialAccountBalanceSnapshot.financial_account_id == account_id)
                .order_by(FinancialAccountBalanceSnapshot.recorded_at.asc())
            ).all()
            assert [f"{snapshot.balance:.2f}" for snapshot in snapshots] == [
                "1000.00",
                "1250.00",
                "1300.00",
            ]

        history = client.get(f"{API_V2}/net-worth/history?months=12")
        assert history.status_code == 200
        points = history.json()["points"]
        assert [point["totalNetWorth"] for point in points] == ["1000.00", "1300.00"]
        assert len({point["recordedAt"][:10] for point in points}) == len(points)
        assert history.json()["changeAmount"] == "300.00"
        assert history.json()["changePercent"] == "30.00"


def test_archiving_preserves_past_total_and_changes_only_from_archive_day() -> None:
    with TestClient(app) as client:
        register(client, "archive-history@example.com")
        bankinter = create_account(
            client,
            name="Bankinter",
            account_type="savings",
            purpose="savings",
            balance="1000.00",
        )
        trade_republic = create_account(
            client,
            name="Trade Republic",
            account_type="broker",
            purpose="investment",
            balance="2000.00",
        )
        ids = [UUID(str(bankinter["id"])), UUID(str(trade_republic["id"]))]
        move_initial_snapshots_to(ids, datetime.now(timezone.utc) - timedelta(days=30))

        archived = client.delete(f"{API_V2}/financial-accounts/{bankinter['id']}")
        assert archived.status_code == 204

        history = client.get(f"{API_V2}/net-worth/history?months=12").json()
        values = [point["totalNetWorth"] for point in history["points"]]
        assert values[0] == "3000.00"
        assert values[-1] == "2000.00"
        assert history["changeAmount"] == "-1000.00"
        assert history["changePercent"] == "-33.33"


def test_excluding_account_preserves_earlier_history() -> None:
    with TestClient(app) as client:
        register(client, "include-history@example.com")
        account = create_account(
            client,
            name="Opportunity cash",
            account_type="savings",
            purpose="opportunities",
            balance="1500.00",
        )
        account_id = UUID(str(account["id"]))
        move_initial_snapshots_to(
            [account_id],
            datetime.now(timezone.utc) - timedelta(days=10),
        )

        response = client.patch(
            f"{API_V2}/financial-accounts/{account['id']}",
            json={"includeInNetWorth": False},
        )
        assert response.status_code == 200, response.text
        assert response.json()["includeInNetWorth"] is False

        history = client.get(f"{API_V2}/net-worth/history?months=12").json()
        assert [point["totalNetWorth"] for point in history["points"]] == ["1500.00", "0.00"]
        assert history["changeAmount"] == "-1500.00"
        assert history["changePercent"] == "-100.00"


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
        archived_account = next(item for item in archived_rows if item["id"] == private_account["id"])
        assert archived_account["archived"] is True
        assert archived_account["currentBalance"] == "3000.00"


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
