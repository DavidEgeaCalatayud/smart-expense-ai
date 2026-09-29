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


def register(client: TestClient, email: str = "net-worth-sync@example.com") -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery-staple",
            "displayName": "Net Worth Sync User",
        },
    )
    assert response.status_code == 201, response.text


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


def account_payload(balance: str, snapshot_id: str | None) -> dict[str, object]:
    return {
        "name": "Trade Republic",
        "institution": "Trade Republic",
        "accountType": "broker",
        # Intentionally send a non-investment purpose to verify the server-side ORM
        # invariant also protects sync clients, including older app versions.
        "purpose": "opportunities",
        "currentBalance": balance,
        "currency": "EUR",
        "includeInNetWorth": True,
        "archived": False,
        "balanceUpdatedAt": "2026-09-26T16:00:00Z",
        "balanceSnapshotId": snapshot_id,
    }


def test_bootstrap_reconstructs_web_financial_account_and_history(client: TestClient) -> None:
    register(client)
    created = client.post(
        "/api/v2/financial-accounts",
        json={
            "name": "Bankinter",
            "institution": "Bankinter",
            "accountType": "savings",
            "purpose": "emergency_fund",
            "currentBalance": "3000.00",
            "currency": "EUR",
            "includeInNetWorth": True,
        },
    )
    assert created.status_code == 201, created.text
    account_id = created.json()["id"]

    changes, _ = bootstrap_all(client)
    account_change = next(
        change
        for change in changes
        if change["entityType"] == "financial_account" and change["entityId"] == account_id
    )
    snapshot_change = next(
        change
        for change in changes
        if change["entityType"] == "financial_account_snapshot"
        and change["payload"]["financialAccountId"] == account_id
    )
    assert account_change["payload"]["currentBalance"] == "3000.00"
    assert account_change["payload"]["purpose"] == "emergency_fund"
    assert account_change["payload"]["balanceSnapshotId"] is None
    assert snapshot_change["payload"]["balance"] == "3000.00"
    assert snapshot_change["version"] == 1


def test_offline_account_create_and_balance_update_keep_canonical_snapshot_ids(client: TestClient) -> None:
    register(client)
    _, cursor = bootstrap_all(client)
    device_id = str(uuid4())
    account_id = str(uuid4())
    first_snapshot_id = str(uuid4())

    create_push = client.post(
        "/api/v2/sync/push",
        json={
            "protocolVersion": "sync-v1",
            "deviceId": device_id,
            "mutations": [
                {
                    "mutationId": str(uuid4()),
                    "entityId": account_id,
                    "entityType": "financial_account",
                    "operation": "upsert",
                    "baseVersion": None,
                    "clientOccurredAt": "2026-09-26T16:00:00Z",
                    "payload": account_payload("1000.00", first_snapshot_id),
                }
            ],
        },
    )
    assert create_push.status_code == 200, create_push.text
    assert create_push.json()["results"][0]["status"] == "applied"
    assert create_push.json()["results"][0]["serverVersion"] == 1

    accounts_after_create = client.get("/api/v2/financial-accounts")
    assert accounts_after_create.status_code == 200
    synced_created = next(item for item in accounts_after_create.json() if item["id"] == account_id)
    assert synced_created["accountType"] == "broker"
    assert synced_created["purpose"] == "investment"

    pulled = client.get("/api/v2/sync/pull", params={"cursor": cursor, "limit": 100})
    assert pulled.status_code == 200, pulled.text
    created_changes = pulled.json()["changes"]
    created_account_change = next(
        item
        for item in created_changes
        if item["entityType"] == "financial_account" and item["entityId"] == account_id
    )
    assert created_account_change["payload"]["purpose"] == "investment"
    assert any(
        item["entityType"] == "financial_account_snapshot"
        and item["entityId"] == first_snapshot_id
        and item["payload"]["balance"] == "1000.00"
        for item in created_changes
    )

    second_snapshot_id = str(uuid4())
    update_push = client.post(
        "/api/v2/sync/push",
        json={
            "protocolVersion": "sync-v1",
            "deviceId": device_id,
            "mutations": [
                {
                    "mutationId": str(uuid4()),
                    "entityId": account_id,
                    "entityType": "financial_account",
                    "operation": "upsert",
                    "baseVersion": 1,
                    "clientOccurredAt": "2026-10-10T10:00:00Z",
                    "payload": account_payload("1250.00", second_snapshot_id),
                }
            ],
        },
    )
    assert update_push.status_code == 200, update_push.text
    assert update_push.json()["results"][0]["status"] == "applied"
    assert update_push.json()["results"][0]["serverVersion"] == 2

    accounts = client.get("/api/v2/financial-accounts")
    assert accounts.status_code == 200
    account = next(item for item in accounts.json() if item["id"] == account_id)
    assert account["currentBalance"] == "1250.00"
    assert account["purpose"] == "investment"

    _, latest_cursor = bootstrap_all(client)
    all_changes, _ = bootstrap_all(client)
    snapshot_ids = {
        item["entityId"]
        for item in all_changes
        if item["entityType"] == "financial_account_snapshot"
        and item["payload"]["financialAccountId"] == account_id
    }
    assert first_snapshot_id in snapshot_ids
    assert second_snapshot_id in snapshot_ids
    assert latest_cursor

    history = client.get("/api/v2/net-worth/history?months=12")
    assert history.status_code == 200
    assert history.json()["points"][-1]["totalNetWorth"] == "1250.00"


def test_financial_account_sync_conflict_and_snapshot_read_only_contract(client: TestClient) -> None:
    register(client)
    device_id = str(uuid4())
    account_id = str(uuid4())
    snapshot_id = str(uuid4())
    created = client.post(
        "/api/v2/sync/push",
        json={
            "protocolVersion": "sync-v1",
            "deviceId": device_id,
            "mutations": [
                {
                    "mutationId": str(uuid4()),
                    "entityId": account_id,
                    "entityType": "financial_account",
                    "operation": "upsert",
                    "baseVersion": None,
                    "clientOccurredAt": "2026-09-26T16:00:00Z",
                    "payload": account_payload("1000.00", snapshot_id),
                }
            ],
        },
    )
    assert created.status_code == 200
    assert created.json()["results"][0]["serverVersion"] == 1

    # Broker purpose is already normalized to investment by every ORM write path. Change
    # institution so the server version definitely advances and the following mutation is stale.
    web_update = client.patch(
        f"/api/v2/financial-accounts/{account_id}",
        json={"institution": "Trade Republic Web"},
    )
    assert web_update.status_code == 200

    stale_payload = account_payload("1100.00", str(uuid4()))
    stale = client.post(
        "/api/v2/sync/push",
        json={
            "protocolVersion": "sync-v1",
            "deviceId": device_id,
            "mutations": [
                {
                    "mutationId": str(uuid4()),
                    "entityId": account_id,
                    "entityType": "financial_account",
                    "operation": "upsert",
                    "baseVersion": 1,
                    "clientOccurredAt": "2026-09-26T17:00:00Z",
                    "payload": stale_payload,
                }
            ],
        },
    )
    assert stale.status_code == 200, stale.text
    assert stale.json()["results"][0]["status"] == "conflict"
    conflict = stale.json()["conflicts"][0]
    assert conflict["reason"] == "stale_version"
    assert conflict["serverVersion"] == 2
    assert conflict["serverPayload"]["purpose"] == "investment"
    assert conflict["serverPayload"]["currentBalance"] == "1000.00"

    raw_snapshot_mutation = client.post(
        "/api/v2/sync/push",
        json={
            "protocolVersion": "sync-v1",
            "deviceId": device_id,
            "mutations": [
                {
                    "mutationId": str(uuid4()),
                    "entityId": str(uuid4()),
                    "entityType": "financial_account_snapshot",
                    "operation": "upsert",
                    "baseVersion": None,
                    "clientOccurredAt": "2026-09-26T17:01:00Z",
                    "payload": {
                        "financialAccountId": account_id,
                        "balance": "9999.00",
                        "recordedAt": "2026-09-26T17:01:00Z",
                        "source": "manual",
                    },
                }
            ],
        },
    )
    assert raw_snapshot_mutation.status_code == 200, raw_snapshot_mutation.text
    result = raw_snapshot_mutation.json()["results"][0]
    assert result["status"] == "rejected"
    assert result["error"]["code"] == "read_only_sync_entity"
