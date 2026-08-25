from collections import Counter
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.db.session import engine
from app.main import app
from app.models.intelligence import IntelligenceFinding, IntelligenceScan
from app.models.transaction import Transaction as TransactionModel
from app.models.user import User


pytestmark = pytest.mark.integration
API = "/api/v1"
API_V2 = "/api/v2"


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


def register(client: TestClient, email: str) -> None:
    response = client.post(
        f"{API}/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery-staple",
            "displayName": "Intelligence Owner",
        },
    )
    assert response.status_code == 201


def create_expense(client: TestClient, merchant: str, amount: float, value: str) -> None:
    response = client.post(
        f"{API}/transactions",
        json={
            "merchant": merchant,
            "description": "Financial intelligence fixture",
            "category": "Subscriptions",
            "amount": amount,
            "date": value,
            "type": "expense",
            "paymentMethod": "card",
            "isRecurring": False,
        },
    )
    assert response.status_code == 201


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
        create_expense(client, merchant, amount, value)


def test_intelligence_endpoints_require_authentication(client: TestClient) -> None:
    assert client.post(f"{API}/intelligence/scan").status_code == 401
    assert client.get(f"{API}/intelligence/findings").status_code == 401
    assert client.get(f"{API}/intelligence/summary").status_code == 401
    assert client.get(f"{API_V2}/intelligence/findings").status_code == 401


def test_scan_persists_rules_v2_findings_and_is_idempotent(client: TestClient) -> None:
    register(client, "owner@example.com")
    seed_rule_evidence(client)

    scan_response = client.post(f"{API}/intelligence/scan")
    assert scan_response.status_code == 200
    scan = scan_response.json()
    assert scan["ruleVersion"] == "rules-v2"
    assert scan["analyzedTransactions"] == 13
    assert scan["detectedFindings"] == 5

    findings_response = client.get(f"{API}/intelligence/findings?status=open")
    assert findings_response.status_code == 200
    findings = findings_response.json()
    counts = Counter(finding["type"] for finding in findings)
    assert counts == Counter(
        {
            "recurring_pattern": 2,
            "recurring_payment_missing": 1,
            "duplicate_subscription": 1,
            "spending_anomaly": 1,
        }
    )
    assert all(finding["explanation"] for finding in findings)
    assert all(finding["evidence"] for finding in findings)
    assert all(finding["ruleVersion"] == "rules-v2" for finding in findings)
    first_ids = sorted(finding["id"] for finding in findings)

    second_scan = client.post(f"{API}/intelligence/scan")
    assert second_scan.status_code == 200
    second_findings = client.get(f"{API}/intelligence/findings?status=open").json()
    assert sorted(finding["id"] for finding in second_findings) == first_ids

    summary = client.get(f"{API}/intelligence/summary").json()
    assert summary["openCount"] == 5
    assert summary["recurringCount"] == 2
    assert summary["missingRecurringCount"] == 1
    assert summary["duplicateSubscriptionCount"] == 1
    assert summary["anomalyCount"] == 1
    assert summary["amountAnomalyCount"] == 1
    assert summary["frequencyAnomalyCount"] == 0
    assert summary["ruleVersion"] == "rules-v2"
    assert summary["lastScanAt"] is not None
    assert summary["analyzedTransactions"] == 13


def test_intelligence_money_evidence_is_versioned_without_breaking_v1(client: TestClient) -> None:
    register(client, "owner@example.com")
    seed_rule_evidence(client)
    client.post(f"{API}/intelligence/scan")

    legacy = client.get(f"{API}/intelligence/findings?type=spending_anomaly").json()[0]
    decimal_safe = client.get(f"{API_V2}/intelligence/findings?type=spending_anomaly").json()[0]

    assert legacy["evidence"]["amount"] == 85.0
    assert isinstance(legacy["evidence"]["amount"], float)
    assert legacy["evidence"]["ratio"] == 4.25
    assert decimal_safe["evidence"]["amount"] == "85.00"
    assert decimal_safe["evidence"]["baselineMedian"] == "20.00"
    assert decimal_safe["evidence"]["robustSpread"] == "1.00"
    assert decimal_safe["evidence"]["ratio"] == "4.25"


def test_frequency_anomaly_is_persisted_and_counted_separately(client: TestClient) -> None:
    register(client, "frequency@example.com")
    for amount, value in [
        (5.00, "2026-01-10"),
        (5.00, "2026-02-10"),
        (5.00, "2026-03-10"),
        (5.00, "2026-04-01"),
        (5.00, "2026-04-02"),
        (5.00, "2026-04-03"),
        (5.00, "2026-04-04"),
    ]:
        create_expense(client, "API Tools", amount, value)

    scan = client.post(f"{API}/intelligence/scan")
    assert scan.status_code == 200
    finding_response = client.get(f"{API_V2}/intelligence/findings?type=frequency_anomaly")
    assert finding_response.status_code == 200
    findings = finding_response.json()
    assert len(findings) == 1
    assert findings[0]["evidence"]["currentCount"] == 4
    assert findings[0]["evidence"]["baselineMedianCount"] == "1.0"
    assert findings[0]["evidence"]["maxChargesIn7Days"] == 4

    summary = client.get(f"{API}/intelligence/summary").json()
    assert summary["frequencyAnomalyCount"] == 1
    assert summary["amountAnomalyCount"] == 0
    assert summary["anomalyCount"] == 1


def test_dismissed_finding_stays_dismissed_after_rescan(client: TestClient) -> None:
    register(client, "owner@example.com")
    seed_rule_evidence(client)
    client.post(f"{API}/intelligence/scan")

    finding = client.get(f"{API}/intelligence/findings?type=duplicate_subscription").json()[0]
    dismiss = client.patch(
        f"{API}/intelligence/findings/{finding['id']}",
        json={"status": "dismissed"},
    )
    assert dismiss.status_code == 200
    assert dismiss.json()["status"] == "dismissed"

    client.post(f"{API}/intelligence/scan")
    after_scan = client.get(f"{API}/intelligence/findings?type=duplicate_subscription").json()[0]
    assert after_scan["id"] == finding["id"]
    assert after_scan["status"] == "dismissed"


def test_findings_are_scoped_to_authenticated_user(client: TestClient) -> None:
    register(client, "owner@example.com")
    seed_rule_evidence(client)
    client.post(f"{API}/intelligence/scan")
    owner_finding = client.get(f"{API}/intelligence/findings").json()[0]

    client.post(f"{API}/auth/logout")
    register(client, "other@example.com")

    assert client.get(f"{API}/intelligence/findings").json() == []
    summary = client.get(f"{API}/intelligence/summary").json()
    assert summary["openCount"] == 0
    assert summary["lastScanAt"] is None

    forbidden_lookup = client.patch(
        f"{API}/intelligence/findings/{owner_finding['id']}",
        json={"status": "resolved"},
    )
    assert forbidden_lookup.status_code == 404
    assert forbidden_lookup.json()["error"]["code"] == "intelligence_finding_not_found"
