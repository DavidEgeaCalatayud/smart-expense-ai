from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.db.session import engine
from app.main import app
from app.models.import_batch import ImportBatch
from app.models.transaction import Transaction as TransactionModel
from app.models.user import User


pytestmark = pytest.mark.integration
AUTH_API = "/api/v1"
IMPORT_API = "/api/v2/imports"
TRANSACTION_API = "/api/v2/transactions"


@pytest.fixture(autouse=True)
def clean_account_data() -> Generator[None, None, None]:
    with engine.begin() as connection:
        connection.execute(delete(TransactionModel))
        connection.execute(delete(ImportBatch))
        connection.execute(delete(User))

    yield

    with engine.begin() as connection:
        connection.execute(delete(TransactionModel))
        connection.execute(delete(ImportBatch))
        connection.execute(delete(User))


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client


def register(client: TestClient, email: str = "csv-owner@example.com") -> None:
    response = client.post(
        f"{AUTH_API}/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery-staple",
            "displayName": "CSV Owner",
        },
    )
    assert response.status_code == 201


def import_payload(content: str, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "filename": "statement.csv",
        "content": content,
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
    payload.update(overrides)
    return payload


def assert_error_code(response, code: str) -> dict[str, object]:
    body = response.json()
    assert body["error"]["code"] == code
    return body["error"]


def test_import_endpoints_require_authentication(client: TestClient) -> None:
    response = client.post(
        f"{IMPORT_API}/csv/detect",
        json={"filename": "statement.csv", "content": "Fecha;Importe;Concepto\n24/08/2026;-10,00;Cafe"},
    )
    assert response.status_code == 401


def test_detects_spanish_bank_columns_and_delimiter(client: TestClient) -> None:
    register(client)
    content = "Fecha;Concepto;Importe;Referencia;Moneda\n24/08/2026;MERCADONA 1293;-42,51;Compra;EUR"

    response = client.post(
        f"{IMPORT_API}/csv/detect",
        json={"filename": "bank.csv", "content": content},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["delimiter"] == ";"
    assert body["headers"] == ["Fecha", "Concepto", "Importe", "Referencia", "Moneda"]
    assert body["suggestedMapping"]["date"] == "Fecha"
    assert body["suggestedMapping"]["merchant"] == "Concepto"
    assert body["suggestedMapping"]["amount"] == "Importe"
    assert len(body["fileHash"]) == 64


def test_preview_normalizes_decimal_comma_dates_and_in_file_duplicates(client: TestClient) -> None:
    register(client)
    content = (
        "Fecha;Concepto;Importe;Referencia;Moneda\n"
        "24/08/2026;MERCADONA 1293;-42,51;Compra semanal;EUR\n"
        "24/08/2026;MERCADONA 1293;-42,51;Compra semanal;EUR\n"
        "25/08/2026;EMPRESA ACME;1500,00;Nomina;EUR\n"
    )

    response = client.post(f"{IMPORT_API}/csv/preview", json=import_payload(content))

    assert response.status_code == 200
    body = response.json()
    assert body["rowsTotal"] == 3
    assert body["validRows"] == 2
    assert body["duplicateRows"] == 1
    assert body["invalidRows"] == 0
    assert body["previewRows"][0]["transaction"] == {
        "date": "2026-08-24",
        "merchant": "MERCADONA 1293",
        "description": "Compra semanal",
        "amount": "42.51",
        "currency": "EUR",
        "category": "Other",
        "type": "expense",
        "paymentMethod": "bank_transfer",
        "fingerprint": body["previewRows"][0]["transaction"]["fingerprint"],
    }
    assert body["previewRows"][1]["status"] == "duplicate"
    assert body["previewRows"][2]["transaction"]["type"] == "income"
    assert body["previewRows"][2]["transaction"]["category"] == "Salary"


def test_invalid_rows_block_the_entire_commit(client: TestClient) -> None:
    register(client)
    content = (
        "Fecha;Concepto;Importe;Referencia;Moneda\n"
        "24/08/2026;Valid Market;-42,51;Compra;EUR\n"
        "25/08/2026;Foreign Market;-10,00;Compra;USD\n"
    )

    preview = client.post(f"{IMPORT_API}/csv/preview", json=import_payload(content))
    assert preview.status_code == 200
    assert preview.json()["invalidRows"] == 1

    commit = client.post(f"{IMPORT_API}/csv/commit", json=import_payload(content))
    assert commit.status_code == 422
    error = assert_error_code(commit, "invalid_csv_import")
    assert error["details"]["invalidRows"] == 1

    assert client.get(TRANSACTION_API).json()["total"] == 0
    assert client.get(f"{IMPORT_API}/batches").json()["total"] == 0


def test_commit_is_transactional_and_reimport_skips_existing_fingerprints(client: TestClient) -> None:
    register(client)
    content = (
        "Fecha;Concepto;Importe;Referencia;Moneda\n"
        "24/08/2026;Market One;-42,51;Compra A;EUR\n"
        "25/08/2026;Market Two;-10,00;Compra B;EUR\n"
    )
    payload = import_payload(content)

    first = client.post(f"{IMPORT_API}/csv/commit", json=payload)
    assert first.status_code == 201
    assert first.json()["importedCount"] == 2
    assert first.json()["duplicatesSkipped"] == 0

    second_preview = client.post(f"{IMPORT_API}/csv/preview", json=payload)
    assert second_preview.status_code == 200
    assert second_preview.json()["validRows"] == 0
    assert second_preview.json()["duplicateRows"] == 2

    second = client.post(f"{IMPORT_API}/csv/commit", json=payload)
    assert second.status_code == 201
    assert second.json()["importedCount"] == 0
    assert second.json()["duplicatesSkipped"] == 2

    page = client.get(TRANSACTION_API).json()
    assert page["total"] == 2

    batches = client.get(f"{IMPORT_API}/batches").json()
    assert batches["total"] == 2
    assert batches["items"][0]["rowsImported"] == 0
    assert batches["items"][0]["duplicatesSkipped"] == 2
    assert batches["items"][1]["rowsImported"] == 2

    with engine.connect() as connection:
        stored = connection.execute(
            select(
                TransactionModel.source,
                TransactionModel.import_fingerprint,
                TransactionModel.import_batch_id,
            ).order_by(TransactionModel.transaction_date)
        ).all()
    assert len(stored) == 2
    assert all(row.source == "import" for row in stored)
    assert all(row.import_fingerprint is not None for row in stored)
    assert all(row.import_batch_id is not None for row in stored)


def test_fingerprints_are_scoped_per_authenticated_user(client: TestClient) -> None:
    content = (
        "Fecha;Concepto;Importe;Referencia;Moneda\n"
        "24/08/2026;Shared Merchant;-42,51;Same movement;EUR\n"
    )
    payload = import_payload(content)

    register(client, "first-csv@example.com")
    assert client.post(f"{IMPORT_API}/csv/commit", json=payload).json()["importedCount"] == 1
    client.post(f"{AUTH_API}/auth/logout")

    with TestClient(app) as second_client:
        register(second_client, "second-csv@example.com")
        preview = second_client.post(f"{IMPORT_API}/csv/preview", json=payload).json()
        assert preview["duplicateRows"] == 0
        assert preview["validRows"] == 1
        assert second_client.post(f"{IMPORT_API}/csv/commit", json=payload).json()["importedCount"] == 1

    with engine.connect() as connection:
        assert len(connection.execute(select(TransactionModel.id)).all()) == 2


def test_explicit_type_and_mapped_category_are_validated(client: TestClient) -> None:
    register(client)
    content = (
        "Date,Merchant,Amount,Type,Category,Currency\n"
        "2026-08-24,Employer,1000.00,income,Salary,EUR\n"
    )
    payload = {
        "filename": "typed.csv",
        "content": content,
        "mapping": {
            "date": "Date",
            "amount": "Amount",
            "merchant": "Merchant",
            "description": None,
            "category": "Category",
            "type": "Type",
            "currency": "Currency",
            "paymentMethod": None,
        },
        "options": {
            "dateFormat": "yyyy-mm-dd",
            "decimalSeparator": "dot",
            "amountConvention": "explicit_type",
            "defaultType": "expense",
            "defaultPaymentMethod": "bank_transfer",
        },
    }

    preview = client.post(f"{IMPORT_API}/csv/preview", json=payload)
    assert preview.status_code == 200
    assert preview.json()["validRows"] == 1
    assert preview.json()["previewRows"][0]["transaction"]["type"] == "income"
    assert preview.json()["previewRows"][0]["transaction"]["category"] == "Salary"
