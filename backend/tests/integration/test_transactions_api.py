from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.db.session import engine
from app.main import app
from app.models.transaction import Transaction as TransactionModel
from app.models.user import User


pytestmark = pytest.mark.integration
API = "/api/v1"


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


def register(client: TestClient, email: str = "owner@example.com") -> dict[str, object]:
    response = client.post(
        f"{API}/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery-staple",
            "displayName": "Integration Owner",
        },
    )
    assert response.status_code == 201
    return response.json()


def transaction_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "merchant": "Integration Market",
        "description": "PostgreSQL integration test",
        "category": "Food",
        "amount": 42.50,
        "date": "2026-08-24",
        "type": "expense",
        "paymentMethod": "card",
        "isRecurring": False,
    }
    payload.update(overrides)
    return payload


def assert_error_contract(response, code: str) -> dict[str, object]:
    body = response.json()
    assert body["error"]["code"] == code
    assert body["error"]["message"]
    assert len(body["error"]["requestId"]) == 32
    return body["error"]


def test_health_and_api_responses_include_security_headers(client: TestClient) -> None:
    health_response = client.get("/health")

    assert health_response.status_code == 200
    assert health_response.headers["cache-control"] == "no-store"
    assert health_response.headers["x-content-type-options"] == "nosniff"
    assert health_response.headers["x-frame-options"] == "DENY"
    assert health_response.headers["referrer-policy"] == "no-referrer"
    assert health_response.headers["cross-origin-opener-policy"] == "same-origin"
    assert health_response.headers["cross-origin-resource-policy"] == "same-origin"
    assert len(health_response.headers["x-request-id"]) == 32

    unauthenticated = client.get(f"{API}/categories")
    assert unauthenticated.status_code == 401
    assert unauthenticated.headers["cache-control"] == "no-store"
    assert_error_contract(unauthenticated, "http_401")


def test_unversioned_api_is_not_part_of_the_public_contract(client: TestClient) -> None:
    response = client.get("/api/transactions")

    assert response.status_code == 404
    assert_error_contract(response, "http_404")


def test_untrusted_host_is_rejected(client: TestClient) -> None:
    response = client.get("/health", headers={"Host": "evil.example"})
    assert response.status_code == 400


def test_cross_site_state_changing_request_is_rejected(client: TestClient) -> None:
    response = client.post(
        f"{API}/auth/register",
        headers={"Origin": "https://evil.example"},
        json={
            "email": "csrf@example.com",
            "password": "correct-horse-battery-staple",
            "displayName": "Cross Site",
        },
    )

    assert response.status_code == 403
    assert_error_contract(response, "cross_site_request_rejected")


def test_protected_financial_endpoints_require_authentication(client: TestClient) -> None:
    assert client.get(f"{API}/categories").status_code == 401
    assert client.get(f"{API}/transactions").status_code == 401
    assert client.get(f"{API}/analytics/summary").status_code == 401


def test_registration_sets_hardened_session_cookie_and_exposes_current_user(
    client: TestClient,
) -> None:
    response = client.post(
        f"{API}/auth/register",
        json={
            "email": "owner@example.com",
            "password": "correct-horse-battery-staple",
            "displayName": "Integration Owner",
        },
    )

    assert response.status_code == 201
    registered = response.json()
    assert registered["user"]["email"] == "owner@example.com"
    assert "smart_expense_session" in client.cookies

    set_cookie = response.headers["set-cookie"].lower()
    assert "httponly" in set_cookie
    assert "samesite=lax" in set_cookie
    assert "path=/" in set_cookie
    assert "max-age=3600" in set_cookie
    assert "secure" not in set_cookie

    me_response = client.get(f"{API}/auth/me")
    assert me_response.status_code == 200
    assert me_response.json()["displayName"] == "Integration Owner"


def test_login_restores_access_in_a_new_client(client: TestClient) -> None:
    register(client)
    client.post(f"{API}/auth/logout")

    with TestClient(app) as second_client:
        login_response = second_client.post(
            f"{API}/auth/login",
            json={"email": "OWNER@example.com", "password": "correct-horse-battery-staple"},
        )
        assert login_response.status_code == 200
        assert second_client.get(f"{API}/transactions").status_code == 200


def test_duplicate_registration_and_invalid_login_use_error_envelope(client: TestClient) -> None:
    register(client)
    client.post(f"{API}/auth/logout")

    duplicate = client.post(
        f"{API}/auth/register",
        json={
            "email": "OWNER@example.com",
            "password": "another-password-long-enough",
            "displayName": "Duplicate",
        },
    )
    assert duplicate.status_code == 409
    duplicate_error = assert_error_contract(duplicate, "http_409")
    assert duplicate_error["message"] == "Unable to create account"

    invalid_login = client.post(
        f"{API}/auth/login",
        json={"email": "owner@example.com", "password": "wrong-password"},
    )
    assert invalid_login.status_code == 401
    invalid_error = assert_error_contract(invalid_login, "http_401")
    assert invalid_error["message"] == "Invalid email or password"


def test_validation_errors_are_normalized(client: TestClient) -> None:
    register(client)
    response = client.get(f"{API}/transactions?pageSize=0")

    assert response.status_code == 422
    error = assert_error_contract(response, "validation_error")
    assert error["details"]


def test_categories_are_served_to_authenticated_user(client: TestClient) -> None:
    register(client)
    response = client.get(f"{API}/categories")

    assert response.status_code == 200
    categories = response.json()
    assert {item["name"] for item in categories} >= {"Food", "Salary"}


def test_transaction_crud_round_trip_uses_paginated_contract(client: TestClient) -> None:
    register(client)
    create_response = client.post(f"{API}/transactions", json=transaction_payload())

    assert create_response.status_code == 201
    created = create_response.json()
    transaction_id = created["id"]

    list_response = client.get(f"{API}/transactions?page=1&pageSize=10")
    page = list_response.json()
    assert [item["id"] for item in page["items"]] == [transaction_id]
    assert page == {
        "items": page["items"],
        "page": 1,
        "pageSize": 10,
        "total": 1,
        "pages": 1,
    }

    update_response = client.put(
        f"{API}/transactions/{transaction_id}",
        json=transaction_payload(amount=150.25, description="Updated integration test"),
    )
    assert update_response.status_code == 200
    assert update_response.json()["status"] == "review"

    assert client.delete(f"{API}/transactions/{transaction_id}").status_code == 204
    empty_page = client.get(f"{API}/transactions").json()
    assert empty_page["items"] == []
    assert empty_page["total"] == 0
    assert empty_page["pages"] == 0


def test_pagination_and_filters_are_applied_server_side(client: TestClient) -> None:
    register(client)
    client.post(
        f"{API}/transactions",
        json=transaction_payload(merchant="Alpha Market", date="2026-08-20", amount=50),
    )
    client.post(
        f"{API}/transactions",
        json=transaction_payload(
            merchant="Beta Subscription",
            description="Recurring service",
            date="2026-08-21",
            amount=150,
            isRecurring=True,
        ),
    )
    client.post(
        f"{API}/transactions",
        json=transaction_payload(
            merchant="Employer",
            description="Monthly salary",
            category="Salary",
            date="2026-08-22",
            amount=500,
            type="income",
            paymentMethod="bank_transfer",
        ),
    )

    first_page = client.get(f"{API}/transactions?page=1&pageSize=2").json()
    second_page = client.get(f"{API}/transactions?page=2&pageSize=2").json()
    assert first_page["total"] == 3
    assert first_page["pages"] == 2
    assert len(first_page["items"]) == 2
    assert len(second_page["items"]) == 1

    review = client.get(f"{API}/transactions?status=review").json()
    assert [item["merchant"] for item in review["items"]] == ["Beta Subscription"]

    recurring = client.get(f"{API}/transactions?recurring=true").json()
    assert recurring["total"] == 1
    assert recurring["items"][0]["isRecurring"] is True

    income = client.get(f"{API}/transactions?type=income&search=salary").json()
    assert income["total"] == 1
    assert income["items"][0]["merchant"] == "Employer"

    date_window = client.get(
        f"{API}/transactions?dateFrom=2026-08-21&dateTo=2026-08-22&sort=oldest"
    ).json()
    assert [item["merchant"] for item in date_window["items"]] == [
        "Beta Subscription",
        "Employer",
    ]


def test_analytics_summary_and_monthly_expenses_are_server_aggregated(client: TestClient) -> None:
    register(client)
    client.post(f"{API}/transactions", json=transaction_payload(amount=42.50))
    client.post(
        f"{API}/transactions",
        json=transaction_payload(merchant="Review Expense", amount=150, isRecurring=True),
    )
    client.post(
        f"{API}/transactions",
        json=transaction_payload(
            merchant="Employer",
            category="Salary",
            amount=500,
            type="income",
            paymentMethod="bank_transfer",
        ),
    )

    summary_response = client.get(f"{API}/analytics/summary")
    assert summary_response.status_code == 200
    assert summary_response.json() == {
        "totalIncome": 500.0,
        "totalExpenses": 192.5,
        "balance": 307.5,
        "recurringCount": 1,
        "reviewCount": 1,
        "transactionCount": 3,
    }

    monthly = client.get(
        f"{API}/analytics/monthly-expenses?months=2&through=2026-08-24"
    ).json()
    assert monthly == [
        {"month": "2026-07", "amount": 0.0},
        {"month": "2026-08", "amount": 192.5},
    ]


def test_invalid_date_range_uses_semantic_error_code(client: TestClient) -> None:
    register(client)
    response = client.get(
        f"{API}/transactions?dateFrom=2026-08-24&dateTo=2026-08-01"
    )

    assert response.status_code == 422
    assert_error_contract(response, "invalid_date_range")


def test_transaction_ownership_is_enforced_between_users(client: TestClient) -> None:
    register(client, "first@example.com")
    created = client.post(f"{API}/transactions", json=transaction_payload()).json()
    transaction_id = created["id"]
    client.post(f"{API}/auth/logout")

    with TestClient(app) as second_client:
        register(second_client, "second@example.com")
        assert second_client.get(f"{API}/transactions").json()["items"] == []
        update_response = second_client.put(
            f"{API}/transactions/{transaction_id}",
            json=transaction_payload(amount=99),
        )
        delete_response = second_client.delete(f"{API}/transactions/{transaction_id}")
        assert update_response.status_code == 404
        assert delete_response.status_code == 404
        assert_error_contract(update_response, "transaction_not_found")

    login_response = client.post(
        f"{API}/auth/login",
        json={"email": "first@example.com", "password": "correct-horse-battery-staple"},
    )
    assert login_response.status_code == 200
    assert [item["id"] for item in client.get(f"{API}/transactions").json()["items"]] == [
        transaction_id
    ]


def test_category_type_validation_is_enforced_by_api(client: TestClient) -> None:
    register(client)
    response = client.post(
        f"{API}/transactions",
        json=transaction_payload(category="Salary", type="expense"),
    )

    assert response.status_code == 422
    error = assert_error_contract(response, "invalid_transaction")
    assert "not valid for expense" in error["message"]
