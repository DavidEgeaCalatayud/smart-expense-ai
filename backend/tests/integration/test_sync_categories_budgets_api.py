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


def register(client: TestClient, email: str) -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery-staple",
            "displayName": "Mobile Sync User",
        },
    )
    assert response.status_code == 201, response.text


def push(client: TestClient, device_id: str, mutations: list[dict[str, object]]) -> dict[str, object]:
    response = client.post(
        "/api/v2/sync/push",
        json={
            "protocolVersion": "sync-v1",
            "deviceId": device_id,
            "mutations": mutations,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def bootstrap_all(client: TestClient) -> list[dict[str, object]]:
    changes: list[dict[str, object]] = []
    snapshot_token: str | None = None
    page_token: str | None = None
    while True:
        params: dict[str, object] = {"limit": 100}
        if snapshot_token is not None:
            params["snapshotToken"] = snapshot_token
        if page_token is not None:
            params["pageToken"] = page_token
        response = client.get("/api/v2/sync/bootstrap", params=params)
        assert response.status_code == 200, response.text
        body = response.json()
        changes.extend(body["changes"])
        snapshot_token = body["snapshotToken"]
        page_token = body["nextPageToken"]
        if page_token is None:
            return changes


def category_upsert(
    *,
    entity_id: str,
    name: str,
    base_version: int | None,
) -> dict[str, object]:
    return {
        "mutationId": str(uuid4()),
        "entityId": entity_id,
        "entityType": "category",
        "operation": "upsert",
        "baseVersion": base_version,
        "clientOccurredAt": "2026-08-31T08:00:00Z",
        "payload": {
            "name": name,
            "transactionType": "expense",
            "systemCategory": False,
            "archived": False,
        },
    }


def budget_upsert(
    *,
    entity_id: str,
    category_id: str,
    amount: str,
    base_version: int | None,
) -> dict[str, object]:
    return {
        "mutationId": str(uuid4()),
        "entityId": entity_id,
        "entityType": "budget",
        "operation": "upsert",
        "baseVersion": base_version,
        "clientOccurredAt": "2026-08-31T08:00:01Z",
        "payload": {
            "categoryId": category_id,
            "month": "2026-08-01",
            "limitAmount": amount,
        },
    }


def test_stale_category_sync_returns_current_server_payload(client: TestClient) -> None:
    register(client, "category-sync@example.com")
    device_id = str(uuid4())
    category_id = str(uuid4())

    created = push(
        client,
        device_id,
        [category_upsert(entity_id=category_id, name="Travel", base_version=None)],
    )
    assert created["results"][0]["status"] == "applied"
    assert created["results"][0]["serverVersion"] == 1

    renamed = client.patch(
        f"/api/v2/categories/{category_id}",
        json={"name": "Trips"},
    )
    assert renamed.status_code == 200, renamed.text

    stale = push(
        client,
        device_id,
        [category_upsert(entity_id=category_id, name="Holidays", base_version=1)],
    )
    assert stale["results"][0]["status"] == "conflict"
    conflict = stale["conflicts"][0]
    assert conflict["reason"] == "stale_version"
    assert conflict["serverVersion"] == 2
    assert conflict["serverPayload"]["name"] == "Trips"


def test_stale_budget_sync_returns_current_server_payload(client: TestClient) -> None:
    register(client, "budget-sync@example.com")
    food = next(
        change
        for change in bootstrap_all(client)
        if change["entityType"] == "category" and change["payload"]["name"] == "Food"
    )
    device_id = str(uuid4())
    budget_id = str(uuid4())

    created = push(
        client,
        device_id,
        [
            budget_upsert(
                entity_id=budget_id,
                category_id=food["entityId"],
                amount="400.00",
                base_version=None,
            )
        ],
    )
    assert created["results"][0]["status"] == "applied"
    assert created["results"][0]["serverVersion"] == 1

    updated = client.put(
        f"/api/v2/budgets/{budget_id}",
        json={"limitAmount": "500.00"},
    )
    assert updated.status_code == 200, updated.text

    stale = push(
        client,
        device_id,
        [
            budget_upsert(
                entity_id=budget_id,
                category_id=food["entityId"],
                amount="450.00",
                base_version=1,
            )
        ],
    )
    assert stale["results"][0]["status"] == "conflict"
    conflict = stale["conflicts"][0]
    assert conflict["reason"] == "stale_version"
    assert conflict["serverVersion"] == 2
    assert conflict["serverPayload"]["limitAmount"] == "500.00"


def test_cross_account_category_and_budget_mutations_do_not_leak_server_payload(
    client: TestClient,
) -> None:
    register(client, "owner-sync@example.com")
    owner_bootstrap = bootstrap_all(client)
    owner_food = next(
        change
        for change in owner_bootstrap
        if change["entityType"] == "category" and change["payload"]["name"] == "Food"
    )
    owner_device = str(uuid4())
    category_id = str(uuid4())
    budget_id = str(uuid4())

    owner_created = push(
        client,
        owner_device,
        [
            category_upsert(entity_id=category_id, name="Private Travel", base_version=None),
            budget_upsert(
                entity_id=budget_id,
                category_id=owner_food["entityId"],
                amount="700.00",
                base_version=None,
            ),
        ],
    )
    assert [result["status"] for result in owner_created["results"]] == ["applied", "applied"]

    logout = client.post("/api/v1/auth/logout")
    assert logout.status_code in (200, 204)
    register(client, "other-sync@example.com")
    other_food = next(
        change
        for change in bootstrap_all(client)
        if change["entityType"] == "category" and change["payload"]["name"] == "Food"
    )

    attempted = push(
        client,
        str(uuid4()),
        [
            category_upsert(entity_id=category_id, name="Probe", base_version=1),
            budget_upsert(
                entity_id=budget_id,
                category_id=other_food["entityId"],
                amount="1.00",
                base_version=1,
            ),
        ],
    )

    assert [result["status"] for result in attempted["results"]] == ["conflict", "conflict"]
    assert len(attempted["conflicts"]) == 2
    for conflict in attempted["conflicts"]:
        assert conflict["reason"] == "ownership_or_visibility_changed"
        assert conflict["serverVersion"] is None
        assert conflict["serverPayload"] is None
