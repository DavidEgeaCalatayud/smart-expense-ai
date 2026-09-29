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


def register(client: TestClient, email: str = "offline-history@example.com") -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery-staple",
            "displayName": "Offline History User",
        },
    )
    assert response.status_code == 201, response.text


def bootstrap_all(client: TestClient) -> list[dict[str, object]]:
    changes: list[dict[str, object]] = []
    snapshot_token: str | None = None
    page_token: str | None = None
    while True:
        params: dict[str, object] = {"limit": 50}
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
            return changes


def observation(
    snapshot_id: str,
    balance: str,
    recorded_at: str,
    *,
    include_in_net_worth: bool = True,
    archived: bool = False,
) -> dict[str, object]:
    return {
        "id": snapshot_id,
        "balance": balance,
        "includeInNetWorth": include_in_net_worth,
        "archived": archived,
        "recordedAt": recorded_at,
        "source": "manual",
    }


def account_payload(
    balance: str,
    *,
    snapshot_id: str | None,
    history_base: dict[str, object] | None,
    observations: list[dict[str, object]],
) -> dict[str, object]:
    return {
        "name": "Trade Republic",
        "institution": "Trade Republic",
        "accountType": "broker",
        "purpose": "opportunities",
        "currentBalance": balance,
        "currency": "EUR",
        "includeInNetWorth": True,
        "archived": False,
        "balanceUpdatedAt": observations[-1]["recordedAt"] if observations else "2026-09-19T10:00:00Z",
        "balanceSnapshotId": snapshot_id,
        "historyBase": history_base,
        "balanceObservations": observations,
    }


def push_account(
    client: TestClient,
    *,
    device_id: str,
    mutation_id: str,
    account_id: str,
    base_version: int | None,
    payload: dict[str, object],
) -> dict[str, object]:
    response = client.post(
        "/api/v2/sync/push",
        json={
            "protocolVersion": "sync-v1",
            "deviceId": device_id,
            "mutations": [
                {
                    "mutationId": mutation_id,
                    "entityId": account_id,
                    "entityType": "financial_account",
                    "operation": "upsert",
                    "baseVersion": base_version,
                    "clientOccurredAt": "2026-09-25T10:00:00Z",
                    "payload": payload,
                }
            ],
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def account_snapshot_changes(
    changes: list[dict[str, object]],
    account_id: str,
) -> list[dict[str, object]]:
    return [
        item
        for item in changes
        if item["entityType"] == "financial_account_snapshot"
        and item["payload"]["financialAccountId"] == account_id
    ]


def test_single_offline_push_preserves_every_intermediate_balance_observation(
    client: TestClient,
) -> None:
    register(client)
    device_id = str(uuid4())
    account_id = str(uuid4())
    mutation_id = str(uuid4())
    snapshot_1000 = str(uuid4())
    snapshot_1200 = str(uuid4())
    snapshot_1500 = str(uuid4())
    observations = [
        observation(snapshot_1000, "1000.00", "2026-09-20T10:00:00Z"),
        observation(snapshot_1200, "1200.00", "2026-09-22T10:00:00Z"),
        observation(snapshot_1500, "1500.00", "2026-09-24T10:00:00Z"),
    ]
    payload = account_payload(
        "1500.00",
        snapshot_id=snapshot_1500,
        history_base=None,
        observations=observations,
    )

    first = push_account(
        client,
        device_id=device_id,
        mutation_id=mutation_id,
        account_id=account_id,
        base_version=None,
        payload=payload,
    )
    assert first["results"][0]["status"] == "applied"
    assert first["results"][0]["serverVersion"] == 1

    changes = bootstrap_all(client)
    snapshots = account_snapshot_changes(changes, account_id)
    by_id = {item["entityId"]: item for item in snapshots}
    assert set(by_id) == {snapshot_1000, snapshot_1200, snapshot_1500}
    assert by_id[snapshot_1000]["payload"]["balance"] == "1000.00"
    assert by_id[snapshot_1000]["payload"]["recordedAt"].startswith("2026-09-20T10:00:00")
    assert by_id[snapshot_1200]["payload"]["balance"] == "1200.00"
    assert by_id[snapshot_1200]["payload"]["recordedAt"].startswith("2026-09-22T10:00:00")
    assert by_id[snapshot_1500]["payload"]["balance"] == "1500.00"
    assert by_id[snapshot_1500]["payload"]["recordedAt"].startswith("2026-09-24T10:00:00")

    accounts = client.get("/api/v2/financial-accounts")
    assert accounts.status_code == 200
    synced = next(item for item in accounts.json() if item["id"] == account_id)
    assert synced["currentBalance"] == "1500.00"

    retry = push_account(
        client,
        device_id=device_id,
        mutation_id=mutation_id,
        account_id=account_id,
        base_version=None,
        payload=payload,
    )
    assert retry["results"][0]["status"] == "duplicate"
    snapshots_after_retry = account_snapshot_changes(bootstrap_all(client), account_id)
    assert len(snapshots_after_retry) == 3


def test_offline_history_preserves_round_trip_when_final_balance_matches_base(
    client: TestClient,
) -> None:
    register(client, "offline-round-trip@example.com")
    created = client.post(
        "/api/v2/financial-accounts",
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
    assert created.status_code == 201, created.text
    account_id = created.json()["id"]

    snapshot_1200 = str(uuid4())
    snapshot_1000 = str(uuid4())
    observations = [
        observation(snapshot_1200, "1200.00", "2026-09-22T10:00:00Z"),
        observation(snapshot_1000, "1000.00", "2026-09-24T10:00:00Z"),
    ]
    payload = account_payload(
        "1000.00",
        snapshot_id=None,
        history_base={
            "currentBalance": "1000.00",
            "includeInNetWorth": True,
            "archived": False,
        },
        observations=observations,
    )
    pushed = push_account(
        client,
        device_id=str(uuid4()),
        mutation_id=str(uuid4()),
        account_id=account_id,
        base_version=1,
        payload=payload,
    )
    assert pushed["results"][0]["status"] == "applied"

    snapshots = account_snapshot_changes(bootstrap_all(client), account_id)
    by_id = {item["entityId"]: item for item in snapshots}
    assert snapshot_1200 in by_id
    assert snapshot_1000 in by_id
    assert by_id[snapshot_1200]["payload"]["balance"] == "1200.00"
    assert by_id[snapshot_1000]["payload"]["balance"] == "1000.00"


def test_stale_offline_batch_does_not_write_intermediate_history(client: TestClient) -> None:
    register(client, "offline-conflict@example.com")
    created = client.post(
        "/api/v2/financial-accounts",
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
    assert created.status_code == 201, created.text
    account_id = created.json()["id"]

    # Broker creation already normalizes purpose to investment, so changing purpose to
    # investment would be a no-op and would not advance the server version. Change a real
    # metadata field to guarantee this offline mutation is stale.
    web_update = client.patch(
        f"/api/v2/financial-accounts/{account_id}",
        json={"institution": "Trade Republic Web"},
    )
    assert web_update.status_code == 200, web_update.text

    snapshot_1200 = str(uuid4())
    snapshot_1500 = str(uuid4())
    observations = [
        observation(snapshot_1200, "1200.00", "2026-09-22T10:00:00Z"),
        observation(snapshot_1500, "1500.00", "2026-09-24T10:00:00Z"),
    ]
    payload = account_payload(
        "1500.00",
        snapshot_id=snapshot_1500,
        history_base={
            "currentBalance": "1000.00",
            "includeInNetWorth": True,
            "archived": False,
        },
        observations=observations,
    )
    pushed = push_account(
        client,
        device_id=str(uuid4()),
        mutation_id=str(uuid4()),
        account_id=account_id,
        base_version=1,
        payload=payload,
    )
    assert pushed["results"][0]["status"] == "conflict"
    assert pushed["conflicts"][0]["reason"] == "stale_version"

    snapshots = account_snapshot_changes(bootstrap_all(client), account_id)
    snapshot_ids = {item["entityId"] for item in snapshots}
    assert snapshot_1200 not in snapshot_ids
    assert snapshot_1500 not in snapshot_ids
