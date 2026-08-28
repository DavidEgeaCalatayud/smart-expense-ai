from __future__ import annotations

import threading
import time
from collections.abc import Generator
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select, update

from app.db.session import SessionLocal, engine
from app.main import app
from app.models.intelligence import IntelligenceFinding, IntelligenceScan
from app.models.transaction import Transaction as TransactionModel
from app.models.user import User
from app.services import intelligence_service, transaction_service


pytestmark = pytest.mark.integration
API = "/api/v1"


@pytest.fixture(autouse=True)
def clean_account_data() -> Generator[None, None, None]:
    with engine.begin() as connection:
        connection.execute(delete(IntelligenceScan))
        connection.execute(delete(IntelligenceFinding))
        connection.execute(delete(TransactionModel))
        connection.execute(delete(User))

    yield

    with engine.begin() as connection:
        connection.execute(delete(IntelligenceScan))
        connection.execute(delete(IntelligenceFinding))
        connection.execute(delete(TransactionModel))
        connection.execute(delete(User))


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client


def register(client: TestClient, email: str = "correctness@example.com") -> None:
    response = client.post(
        f"{API}/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery-staple",
            "displayName": "Correctness Regression",
        },
    )
    assert response.status_code == 201


def create_expense(
    client: TestClient,
    *,
    merchant: str,
    amount: float,
    transaction_date: str,
    category: str = "Food",
) -> str:
    response = client.post(
        f"{API}/transactions",
        json={
            "merchant": merchant,
            "description": "Correctness regression fixture",
            "category": category,
            "amount": amount,
            "date": transaction_date,
            "type": "expense",
            "paymentMethod": "card",
            "isRecurring": False,
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


def seed_rule_evidence(client: TestClient) -> None:
    for merchant, amount, value in [
        ("StreamBox", 9.99, "2026-05-02"),
        ("StreamBox", 9.99, "2026-06-01"),
        ("StreamBox", 10.49, "2026-07-01"),
        ("StreamBox", 9.99, "2026-07-31"),
        ("Video Pro", 12.99, "2026-05-02"),
        ("Video Pro", 12.99, "2026-05-04"),
        ("Video Pro", 12.99, "2026-06-02"),
        ("Video Pro", 13.20, "2026-06-03"),
        ("Cloud Tools", 20.00, "2026-01-01"),
        ("Cloud Tools", 21.00, "2026-02-01"),
        ("Cloud Tools", 19.00, "2026-03-01"),
        ("Cloud Tools", 20.00, "2026-04-01"),
        ("Cloud Tools", 85.00, "2026-05-01"),
    ]:
        create_expense(
            client,
            merchant=merchant,
            amount=amount,
            transaction_date=value,
            category="Subscriptions",
        )


def test_monthly_expenses_respects_mid_month_as_of_cutoff(client: TestClient) -> None:
    register(client)
    create_expense(
        client,
        merchant="Known Before Cutoff",
        amount=40.0,
        transaction_date="2026-08-10",
    )
    create_expense(
        client,
        merchant="Future In Same Month",
        amount=999.0,
        transaction_date="2026-08-20",
    )
    create_expense(
        client,
        merchant="Future At Month End",
        amount=500.0,
        transaction_date="2026-08-31",
    )

    response = client.get(
        f"{API}/analytics/monthly-expenses?months=1&through=2026-08-15"
    )

    assert response.status_code == 200
    assert response.json() == [{"month": "2026-08", "amount": 40.0}]


def test_transaction_pagination_uses_unique_id_as_final_tiebreaker(client: TestClient) -> None:
    register(client)
    transaction_ids = [
        create_expense(
            client,
            merchant=f"Tied Transaction {index}",
            amount=25.0,
            transaction_date="2026-08-10",
        )
        for index in range(4)
    ]
    fixed_created_at = datetime(2026, 8, 10, 12, 0, tzinfo=timezone.utc)
    parsed_ids = [UUID(transaction_id) for transaction_id in transaction_ids]
    with engine.begin() as connection:
        connection.execute(
            update(TransactionModel)
            .where(TransactionModel.id.in_(parsed_ids))
            .values(created_at=fixed_created_at)
        )

    expected = sorted(transaction_ids, reverse=True)
    first_page = client.get(
        f"{API}/transactions?page=1&pageSize=2&sort=amount_high"
    ).json()["items"]
    second_page = client.get(
        f"{API}/transactions?page=2&pageSize=2&sort=amount_high"
    ).json()["items"]
    repeated_first_page = client.get(
        f"{API}/transactions?page=1&pageSize=2&sort=amount_high"
    ).json()["items"]

    observed = [item["id"] for item in first_page + second_page]
    assert observed == expected
    assert [item["id"] for item in repeated_first_page] == expected[:2]
    assert len(set(observed)) == 4


def test_ownership_blind_category_helper_is_not_available() -> None:
    assert not hasattr(transaction_service, "_get_category")
    assert hasattr(transaction_service, "_get_visible_category")


def test_same_user_intelligence_scans_are_serialized(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    email = "concurrent-scan@example.com"
    register(client, email)
    seed_rule_evidence(client)

    with SessionLocal() as db:
        user_id = db.scalar(select(User.id).where(User.email == email))
    assert user_id is not None

    original_rules = intelligence_service.run_financial_intelligence_rules_v2
    state_lock = threading.Lock()
    start_barrier = threading.Barrier(2)
    active_calls = 0
    max_active_calls = 0

    def slow_rules(*args, **kwargs):
        nonlocal active_calls, max_active_calls
        with state_lock:
            active_calls += 1
            max_active_calls = max(max_active_calls, active_calls)
        try:
            time.sleep(0.15)
            return original_rules(*args, **kwargs)
        finally:
            with state_lock:
                active_calls -= 1

    monkeypatch.setattr(
        intelligence_service,
        "run_financial_intelligence_rules_v2",
        slow_rules,
    )

    def run_scan() -> int:
        start_barrier.wait(timeout=5)
        with SessionLocal() as db:
            response = intelligence_service.scan_financial_intelligence(db, user_id)
            return response.detectedFindings

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(run_scan) for _ in range(2)]
        detected_counts = [future.result(timeout=10) for future in futures]

    assert detected_counts == [5, 5]
    assert max_active_calls == 1

    with SessionLocal() as db:
        finding_count = db.scalar(
            select(func.count())
            .select_from(IntelligenceFinding)
            .where(IntelligenceFinding.user_id == user_id)
        )
        scan_count = db.scalar(
            select(func.count())
            .select_from(IntelligenceScan)
            .where(IntelligenceScan.user_id == user_id)
        )

    assert finding_count == 5
    assert scan_count == 2
