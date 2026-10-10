from collections.abc import Generator
from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.db.session import SessionLocal, engine
from app.main import app
from app.models.financial_account import FinancialAccount, FinancialAccountBalanceSnapshot
from app.models.investment import FundNavQuote, InvestmentPosition, InvestmentPositionMovement
from app.models.user import User


pytestmark = pytest.mark.integration
API_V1 = "/api/v1"
API_V2 = "/api/v2"


@pytest.fixture(autouse=True)
def clean_investment_data() -> Generator[None, None, None]:
    def clean() -> None:
        with engine.begin() as connection:
            connection.execute(delete(InvestmentPositionMovement))
            connection.execute(delete(InvestmentPosition))
            connection.execute(delete(FundNavQuote))
            connection.execute(delete(FinancialAccountBalanceSnapshot))
            connection.execute(delete(FinancialAccount))
            connection.execute(delete(User))
    clean()
    yield
    clean()


def register(client: TestClient, email: str) -> None:
    response = client.post(
        f"{API_V1}/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery-staple",
            "displayName": "Investor",
        },
    )
    assert response.status_code == 201, response.text


def create_broker(client: TestClient) -> dict[str, object]:
    response = client.post(
        f"{API_V2}/financial-accounts",
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
    assert response.status_code == 201, response.text
    return response.json()


def test_positions_drive_broker_balance_and_net_worth() -> None:
    with TestClient(app) as client:
        register(client, "investments@example.com")
        broker = create_broker(client)

        created = client.post(
            f"{API_V2}/investments/positions",
            json={
                "financialAccountId": broker["id"],
                "name": "JPM Korea Equity",
                "isin": "LU0301637293",
                "units": "1.00000000",
                "costTotal": "32.97",
                "currency": "EUR",
            },
        )
        assert created.status_code == 201, created.text
        assert created.json()["currentValue"] == "32.97"
        assert created.json()["valueSource"] == "cost_fallback"

        account = client.get(f"{API_V2}/financial-accounts").json()[0]
        assert account["currentBalance"] == "32.97"
        summary = client.get(f"{API_V2}/net-worth/summary").json()
        assert summary["invested"] == "32.97"
        assert summary["totalNetWorth"] == "32.97"

        with SessionLocal() as db:
            db.add(
                FundNavQuote(
                    isin="LU0301637293",
                    nav=Decimal("35.830000"),
                    currency="EUR",
                    valuation_date=date(2026, 10, 6),
                    provider="jpmorgan",
                    source_url="https://example.test/jpm",
                )
            )
            db.commit()

        # Updating absolute holdings revalues from the cached quote without relying on live HTTP.
        updated = client.put(
            f"{API_V2}/investments/positions/{created.json()['id']}/holdings",
            json={
                "units": "1.00000000",
                "costTotal": "32.97",
                "movementType": "adjustment",
                "note": "Revalue from cached public NAV",
            },
        )
        assert updated.status_code == 200, updated.text
        body = updated.json()
        assert body["currentValue"] == "35.83"
        assert body["gainAmount"] == "2.86"
        assert body["gainPercent"] == "8.67"
        assert body["latestNav"] == "35.83"
        assert body["navDate"] == "2026-10-06"

        account = client.get(f"{API_V2}/financial-accounts").json()[0]
        assert account["currentBalance"] == "35.83"
        summary = client.get(f"{API_V2}/net-worth/summary").json()
        assert summary["invested"] == "35.83"

        movements = client.get(
            f"{API_V2}/investments/positions/{created.json()['id']}/movements"
        )
        assert movements.status_code == 200
        assert [row["movementType"] for row in movements.json()] == ["adjustment", "initial"]


def test_investment_positions_require_owned_broker_account() -> None:
    with TestClient(app) as owner, TestClient(app) as other:
        register(owner, "investment-owner@example.com")
        broker = create_broker(owner)
        register(other, "investment-other@example.com")

        response = other.post(
            f"{API_V2}/investments/positions",
            json={
                "financialAccountId": broker["id"],
                "name": "Private fund",
                "isin": "IE00BYX5MX67",
                "units": "10.00000000",
                "costTotal": "100.00",
                "currency": "EUR",
            },
        )
        assert response.status_code == 404
        assert owner.get(f"{API_V2}/investments/portfolios").json() == []


def test_archiving_last_position_zeroes_managed_broker_balance() -> None:
    with TestClient(app) as client:
        register(client, "investment-archive@example.com")
        broker = create_broker(client)
        created = client.post(
            f"{API_V2}/investments/positions",
            json={
                "financialAccountId": broker["id"],
                "name": "Fidelity S&P 500",
                "isin": "IE00BYX5MX67",
                "units": "10.00000000",
                "costTotal": "168.28",
                "currency": "EUR",
            },
        )
        assert created.status_code == 201
        deleted = client.delete(f"{API_V2}/investments/positions/{created.json()['id']}")
        assert deleted.status_code == 204
        assert client.get(f"{API_V2}/financial-accounts").json()[0]["currentBalance"] == "0.00"
        assert client.get(f"{API_V2}/investments/portfolios").json() == []
