from collections.abc import Generator
from uuid import uuid4

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


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client


def register(client: TestClient, email: str = "sync@example.com") -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery-staple",
            "displayName": "Sync User",
        },
    )
    assert response.status_code == 201


def web_transaction(amount: str, merchant: str = "Mercadona") -> dict[str, object]:
    return {
        "merchant": merchant,
        "description": "Sync API test",
        "category": "Food",
        "amount": amount,
        "date": "2026-08-30",
        "type": "expense",
        "paymentMethod": "card",
        "isRecurring": False,
    }


def bootstrap_all(client: TestClient) -> tuple[list[dict[str, object]], str]:
    changes: list[dict[str, object]] = []
    snapshot_token: str | None = None
    page_token: str | None = None
    while True:
        params: dict[str, object] = {"limit": 20}
        if snapshot_token is not None:
            params["snapshotToken"] = snapshot_token
        if page_token is not None:
            params["pageToken"] = page_token
        response = client.get("/api/v2/sync/bootstrap", params=params)
        assert response.status_code == 200, response.text
        body = response.json()
        snapshot_token = body["snapshotToken"]
        changes.extend(body["changes"])
        page_token = body["nextPageToken"]
        if page_token is None:
            assert body["establishedCursor"] is not None
            return changes, body["establishedCursor"]


def test_bootstrap_then_pull_receives_web_transaction_exactly(client: TestClient) -> None:
    register(client)
    initial, cursor = bootstrap_all(client)
    assert any(change["entityType"] == "category" for change in initial)

    created = client.post("/api/v2/transactions", json=web_transaction("32.48"))
    assert created.status_code == 201
    transaction_id = created.json()["id"]

    pulled = client.get("/api/v2/sync/pull", params={"cursor": cursor, "limit": 100})
    assert pulled.status_code == 200, pulled.text
    body = pulled.json()
    transaction_change = next(
        change
        for change in body["changes"]
        if change["entityType"] == "transaction" and change["entityId"] == transaction_id
    )
    assert transaction_change["operation"] == "upsert"
    assert transaction_change["version"] == 1
    assert transaction_change["payload"]["merchant"] == "Mercadona"
    assert transaction_change["payload"]["amount"] == "32.48"
    assert body["nextCursor"] != cursor


def test_push_applies_offline_category_and_transaction_and_is_idempotent(client: TestClient) -> None:
    register(client)
    device_id = str(uuid4())
    category_id = str(uuid4())
    transaction_id = str(uuid4())
    category_mutation_id = str(uuid4())
    transaction_mutation_id = str(uuid4())

    push = {
        "protocolVersion": "sync-v1",
        "deviceId": device_id,
        "mutations": [
            {
                "mutationId": category_mutation_id,
                "entityId": category_id,
                "entityType": "category",
                "operation": "upsert",
                "baseVersion": None,
                "clientOccurredAt": "2026-08-30T12:00:00Z",
                "payload": {
                    "name": "Mobile Food",
                    "transactionType": "expense",
                    "systemCategory": False,
                    "archived": False,
                },
            },
            {
                "mutationId": transaction_mutation_id,
                "entityId": transaction_id,
                "entityType": "transaction",
                "operation": "upsert",
                "baseVersion": None,
                "clientOccurredAt": "2026-08-30T12:00:01Z",
                "payload": {
                    "merchant": "Mercadona",
                    "description": "Created offline",
                    "categoryId": category_id,
                    "amount": "21.35",
                    "currency": "EUR",
                    "transactionDate": "2026-08-30",
                    "transactionType": "expense",
                    "paymentMethod": "card",
                    "isRecurring": False,
                    "source": "manual",
                },
            },
        ],
    }

    first = client.post("/api/v2/sync/push", json=push)
    assert first.status_code == 200, first.text
    assert [item["status"] for item in first.json()["results"]] == ["applied", "applied"]
    assert [item["serverVersion"] for item in first.json()["results"]] == [1, 1]
    assert first.json()["conflicts"] == []

    page = client.get("/api/v2/transactions?page=1&pageSize=20")
    assert page.status_code == 200
    stored = next(item for item in page.json()["items"] if item["id"] == transaction_id)
    assert stored["merchant"] == "Mercadona"
    assert stored["amount"] == "21.35"

    retry = client.post("/api/v2/sync/push", json=push)
    assert retry.status_code == 200, retry.text
    assert [item["status"] for item in retry.json()["results"]] == ["duplicate", "duplicate"]

    reused = {**push, "mutations": [{**push["mutations"][1], "payload": {**push["mutations"][1]["payload"], "amount": "99.00"}}]}
    reused_response = client.post("/api/v2/sync/push", json=reused)
    assert reused_response.status_code == 200
    assert reused_response.json()["results"][0]["status"] == "rejected"
    assert reused_response.json()["results"][0]["error"]["code"] == "mutation_id_reused"


def test_stale_mobile_write_returns_explicit_server_state(client: TestClient) -> None:
    register(client)
    bootstrap, _ = bootstrap_all(client)
    food = next(
        change
        for change in bootstrap
        if change["entityType"] == "category" and change["payload"]["name"] == "Food"
    )
    transaction_id = str(uuid4())
    device_id = str(uuid4())

    create_push = {
        "protocolVersion": "sync-v1",
        "deviceId": device_id,
        "mutations": [
            {
                "mutationId": str(uuid4()),
                "entityId": transaction_id,
                "entityType": "transaction",
                "operation": "upsert",
                "baseVersion": None,
                "clientOccurredAt": "2026-08-30T12:00:00Z",
                "payload": {
                    "merchant": "Mercadona",
                    "description": "Offline",
                    "categoryId": food["entityId"],
                    "amount": "20.00",
                    "currency": "EUR",
                    "transactionDate": "2026-08-30",
                    "transactionType": "expense",
                    "paymentMethod": "card",
                    "isRecurring": False,
                    "source": "manual",
                },
            }
        ],
    }
    created = client.post("/api/v2/sync/push", json=create_push)
    assert created.status_code == 200
    assert created.json()["results"][0]["serverVersion"] == 1

    web_update = client.put(
        f"/api/v2/transactions/{transaction_id}",
        json=web_transaction("40.00", merchant="Mercadona Web"),
    )
    assert web_update.status_code == 200

    stale_mutation = {
        **create_push["mutations"][0],
        "mutationId": str(uuid4()),
        "baseVersion": 1,
        "payload": {
            **create_push["mutations"][0]["payload"],
            "amount": "35.00",
        },
    }
    stale = client.post(
        "/api/v2/sync/push",
        json={
            "protocolVersion": "sync-v1",
            "deviceId": device_id,
            "mutations": [stale_mutation],
        },
    )
    assert stale.status_code == 200, stale.text
    result = stale.json()["results"][0]
    assert result["status"] == "conflict"
    assert result["serverVersion"] == 2
    conflict = stale.json()["conflicts"][0]
    assert conflict["reason"] == "stale_version"
    assert conflict["serverVersion"] == 2
    assert conflict["serverPayload"]["amount"] == "40.00"
    assert conflict["serverPayload"]["merchant"] == "Mercadona Web"


def test_cursor_is_account_scoped_and_tamper_evident(client: TestClient) -> None:
    register(client, "first-sync@example.com")
    _, first_cursor = bootstrap_all(client)

    tampered = first_cursor[:-1] + ("A" if first_cursor[-1] != "A" else "B")
    invalid = client.get("/api/v2/sync/pull", params={"cursor": tampered})
    assert invalid.status_code == 400
    assert invalid.json()["error"]["code"] == "invalid_sync_cursor"

    client.post("/api/v1/auth/logout")
    register(client, "second-sync@example.com")
    cross_account = client.get("/api/v2/sync/pull", params={"cursor": first_cursor})
    assert cross_account.status_code == 400
    assert cross_account.json()["error"]["code"] == "invalid_sync_cursor"
