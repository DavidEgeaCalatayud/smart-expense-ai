from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.session import engine
from app.main import app
from app.models.sync import SyncChange
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


def register(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "sync-journal@example.com",
            "password": "correct-horse-battery-staple",
            "displayName": "Sync Journal",
        },
    )
    assert response.status_code == 201


def transaction_payload(amount: str, merchant: str = "Mercadona") -> dict[str, object]:
    return {
        "merchant": merchant,
        "description": "Journal regression",
        "category": "Food",
        "amount": amount,
        "date": "2026-08-30",
        "type": "expense",
        "paymentMethod": "card",
        "isRecurring": False,
    }


def _transaction_changes(entity_id: str) -> list[SyncChange]:
    with Session(engine) as db:
        return list(
            db.scalars(
                select(SyncChange)
                .where(
                    SyncChange.entity_type == "transaction",
                    SyncChange.entity_id == entity_id,
                )
                .order_by(SyncChange.sequence.asc())
            ).all()
        )


def test_web_transaction_crud_is_captured_as_versioned_sync_changes(client: TestClient) -> None:
    register(client)

    created = client.post("/api/v2/transactions", json=transaction_payload("32.48"))
    assert created.status_code == 201
    transaction_id = created.json()["id"]

    create_changes = _transaction_changes(transaction_id)
    assert len(create_changes) == 1
    assert create_changes[0].operation == "upsert"
    assert create_changes[0].entity_version == 1
    assert create_changes[0].payload_json["amount"] == "32.48"
    assert create_changes[0].payload_json["merchant"] == "Mercadona"

    updated = client.put(
        f"/api/v2/transactions/{transaction_id}",
        json=transaction_payload("35.00", merchant="Mercadona Centro"),
    )
    assert updated.status_code == 200

    update_changes = _transaction_changes(transaction_id)
    assert [change.entity_version for change in update_changes] == [1, 2]
    assert update_changes[-1].payload_json["amount"] == "35.00"
    assert update_changes[-1].payload_json["merchant"] == "Mercadona Centro"

    deleted = client.delete(f"/api/v2/transactions/{transaction_id}")
    assert deleted.status_code == 204

    delete_changes = _transaction_changes(transaction_id)
    assert [change.entity_version for change in delete_changes] == [1, 2, 3]
    assert delete_changes[-1].operation == "delete"
    assert delete_changes[-1].payload_json is None


def test_unrelated_transaction_metadata_update_does_not_advance_sync_version(client: TestClient) -> None:
    register(client)
    created = client.post("/api/v2/transactions", json=transaction_payload("10.00"))
    assert created.status_code == 201
    transaction_id = created.json()["id"]

    with engine.begin() as connection:
        connection.exec_driver_sql(
            "UPDATE transactions SET updated_at = now() WHERE id = %s",
            (transaction_id,),
        )

    changes = _transaction_changes(transaction_id)
    assert len(changes) == 1
    assert changes[0].entity_version == 1
