import csv
from collections.abc import Generator
from io import StringIO
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
            "displayName": "Report Owner",
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
    *,
    merchant: str,
    amount: str,
    category: str,
    transaction_type: str,
    transaction_date: str,
    description: str = "Report test",
) -> dict[str, object]:
    return {
        "merchant": merchant,
        "description": description,
        "category": category,
        "amount": amount,
        "date": transaction_date,
        "type": transaction_type,
        "paymentMethod": "card",
        "isRecurring": False,
    }


def test_reports_require_authentication(client: TestClient) -> None:
    assert client.get("/api/v2/reports/monthly?month=2026-09").status_code == 401
    assert client.get("/api/v2/reports/monthly.csv?month=2026-09").status_code == 401


def test_free_account_cannot_use_premium_reports(client: TestClient) -> None:
    register(client, "free-reports@example.com")

    entitlements = client.get("/api/v2/entitlements")
    assert entitlements.status_code == 200
    assert entitlements.json()["features"]["exportableReports"] == {
        "eligible": False,
        "enabled": False,
    }

    response = client.get("/api/v2/reports/monthly?month=2026-09")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "premium_feature_required"

    csv_response = client.get("/api/v2/reports/monthly.csv?month=2026-09")
    assert csv_response.status_code == 403
    assert csv_response.json()["error"]["code"] == "premium_feature_required"


def test_premium_monthly_report_preserves_exact_money_and_safe_csv(client: TestClient) -> None:
    user_id = register(client, "premium-reports@example.com")
    make_premium(user_id)

    transactions = [
        transaction_payload(
            merchant=" \t=SUM(1,1)",
            amount="12.34",
            category="Food",
            transaction_type="expense",
            transaction_date="2026-09-03",
            description="\t=spreadsheet-formula",
        ),
        transaction_payload(
            merchant="Metro",
            amount="20.00",
            category="Transport",
            transaction_type="expense",
            transaction_date="2026-09-04",
        ),
        transaction_payload(
            merchant="Employer",
            amount="1000.00",
            category="Salary",
            transaction_type="income",
            transaction_date="2026-09-01",
        ),
        transaction_payload(
            merchant="Outside month",
            amount="99.99",
            category="Food",
            transaction_type="expense",
            transaction_date="2026-08-31",
        ),
    ]
    for payload in transactions:
        response = client.post("/api/v2/transactions", json=payload)
        assert response.status_code == 201

    entitlements = client.get("/api/v2/entitlements").json()
    assert entitlements["features"]["exportableReports"] == {
        "eligible": True,
        "enabled": True,
    }

    response = client.get("/api/v2/reports/monthly?month=2026-09")
    assert response.status_code == 200
    payload = response.json()
    assert payload["reportVersion"] == "monthly-financial-report-v1"
    assert payload["month"] == "2026-09"
    assert payload["currency"] == "EUR"
    assert payload["totalIncome"] == "1000.00"
    assert payload["totalExpenses"] == "32.34"
    assert payload["net"] == "967.66"
    assert payload["transactionCount"] == 3
    assert payload["downloadFilename"] == "smart-expense-report-2026-09.csv"
    breakdown = {
        (item["type"], item["category"]): (item["total"], item["transactionCount"])
        for item in payload["categoryBreakdown"]
    }
    assert breakdown == {
        ("expense", "Food"): ("12.34", 1),
        ("expense", "Transport"): ("20.00", 1),
        ("income", "Salary"): ("1000.00", 1),
    }

    csv_response = client.get("/api/v2/reports/monthly.csv?month=2026-09")
    assert csv_response.status_code == 200
    assert csv_response.headers["content-type"].startswith("text/csv")
    assert (
        csv_response.headers["content-disposition"]
        == 'attachment; filename="smart-expense-report-2026-09.csv"'
    )
    csv_text = csv_response.text
    assert "totalIncome,1000.00" in csv_text
    assert "totalExpenses,32.34" in csv_text
    assert "net,967.66" in csv_text
    assert "Outside month" not in csv_text

    csv_rows = list(csv.reader(StringIO(csv_text)))
    transaction_header = [
        "date",
        "type",
        "merchant",
        "category",
        "amount",
        "paymentMethod",
        "recurring",
        "source",
        "description",
    ]
    transaction_header_index = csv_rows.index(transaction_header)
    transaction_rows = csv_rows[transaction_header_index + 1 :]
    dangerous_row = next(row for row in transaction_rows if row[4] == "12.34")
    assert dangerous_row[2] == "' \t=SUM(1,1)"
    assert dangerous_row[8] == "'\t=spreadsheet-formula"


def test_reports_are_account_isolated_and_validate_month(client: TestClient) -> None:
    first_user_id = register(client, "first-reports@example.com")
    make_premium(first_user_id)
    created = client.post(
        "/api/v2/transactions",
        json=transaction_payload(
            merchant="First Account Only",
            amount="44.00",
            category="Food",
            transaction_type="expense",
            transaction_date="2026-09-05",
        ),
    )
    assert created.status_code == 201

    assert client.post("/api/v1/auth/logout").status_code == 204
    second_user_id = register(client, "second-reports@example.com")
    make_premium(second_user_id)
    created = client.post(
        "/api/v2/transactions",
        json=transaction_payload(
            merchant="Second Account Only",
            amount="10.00",
            category="Food",
            transaction_type="expense",
            transaction_date="2026-09-06",
        ),
    )
    assert created.status_code == 201

    second_report = client.get("/api/v2/reports/monthly.csv?month=2026-09")
    assert second_report.status_code == 200
    assert "Second Account Only" in second_report.text
    assert "First Account Only" not in second_report.text

    invalid = client.get("/api/v2/reports/monthly?month=2026-13")
    assert invalid.status_code == 422
