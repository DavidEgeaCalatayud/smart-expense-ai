from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import engine
from app.main import app
from app.models.import_batch import ImportBatch
from app.models.transaction import Transaction
from app.models.user import User


pytestmark = pytest.mark.integration
AUTH_API = "/api/v1/auth"
IMPORT_API = "/api/v2/imports"
PASSWORD = "correct-horse-battery-staple"


@pytest.fixture(autouse=True)
def clean_account_data() -> Generator[None, None, None]:
    with Session(engine) as db:
        db.query(User).delete()
        db.commit()
    yield
    with Session(engine) as db:
        db.query(User).delete()
        db.commit()


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client


def register(client: TestClient, email: str) -> None:
    response = client.post(
        f"{AUTH_API}/register",
        json={
            "email": email,
            "password": PASSWORD,
            "displayName": "CSV Privacy Owner",
        },
    )
    assert response.status_code == 201


def payload(marker: str) -> dict[str, object]:
    return {
        "filename": f"{marker}.csv",
        "content": (
            "Fecha;Concepto;Importe;Referencia;Moneda\n"
            f"24/08/2026;{marker} Market;-42,51;{marker} reference;EUR\n"
        ),
        "mapping": {
            "date": "Fecha",
            "amount": "Importe",
            "merchant": "Concepto",
            "description": "Referencia",
            "category": None,
            "type": None,
            "currency": "Moneda",
            "paymentMethod": None,
        },
        "options": {
            "dateFormat": "dd/mm/yyyy",
            "decimalSeparator": "comma",
            "amountConvention": "negative_expense",
            "defaultType": "expense",
            "defaultPaymentMethod": "bank_transfer",
        },
    }


def test_privacy_export_contains_only_the_current_users_import_batches(client: TestClient) -> None:
    register(client, "csv-owner@example.com")
    owner_commit = client.post(f"{IMPORT_API}/csv/commit", json=payload("OWNER-CSV"))
    assert owner_commit.status_code == 201
    owner_batch = owner_commit.json()["batch"]

    with TestClient(app) as other_client:
        register(other_client, "csv-other@example.com")
        assert other_client.post(
            f"{IMPORT_API}/csv/commit",
            json=payload("OTHER-CSV-SECRET"),
        ).status_code == 201

    response = client.get(f"{AUTH_API}/privacy-export")
    assert response.status_code == 200
    export = response.json()

    assert len(export["importBatches"]) == 1
    assert export["importBatches"][0] == {
        "id": owner_batch["id"],
        "filename": "OWNER-CSV.csv",
        "fileHash": owner_batch["fileHash"],
        "rowsTotal": 1,
        "rowsImported": 1,
        "duplicatesSkipped": 0,
        "invalidRows": 0,
        "createdAt": owner_batch["createdAt"],
    }
    assert export["transactions"][0]["source"] == "import"
    assert "OTHER-CSV-SECRET" not in response.text


def test_account_deletion_cascades_import_batches_and_imported_transactions(client: TestClient) -> None:
    register(client, "csv-delete@example.com")
    assert client.post(f"{IMPORT_API}/csv/commit", json=payload("DELETE-CSV")).status_code == 201

    with Session(engine) as db:
        assert db.scalar(select(func.count(ImportBatch.id))) == 1
        assert db.scalar(select(func.count(Transaction.id))) == 1

    response = client.request(
        "DELETE",
        f"{AUTH_API}/account",
        json={"password": PASSWORD, "confirmation": "DELETE"},
    )
    assert response.status_code == 204

    with Session(engine) as db:
        assert db.scalar(select(func.count(ImportBatch.id))) == 0
        assert db.scalar(select(func.count(Transaction.id))) == 0
