from __future__ import annotations

import json
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.db.session import engine
from app.integrations.llm.client import LLMProviderTurn, LLMToolCall
from app.main import app
from app.models.transaction import Transaction as TransactionModel
from app.models.user import User
from app.routers.financial_assistant import get_financial_assistant_provider


pytestmark = pytest.mark.integration
API_V1 = "/api/v1"
API_V2 = "/api/v2"


@pytest.fixture(autouse=True)
def clean_data() -> Generator[None, None, None]:
    app.dependency_overrides.pop(get_financial_assistant_provider, None)
    with engine.begin() as connection:
        connection.execute(delete(TransactionModel))
        connection.execute(delete(User))
    yield
    app.dependency_overrides.pop(get_financial_assistant_provider, None)
    with engine.begin() as connection:
        connection.execute(delete(TransactionModel))
        connection.execute(delete(User))


def register(client: TestClient, email: str) -> None:
    response = client.post(
        f"{API_V1}/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery-staple",
            "displayName": "Assistant Owner",
        },
    )
    assert response.status_code == 201


def add_expense(client: TestClient, amount: str, transaction_date: str) -> None:
    response = client.post(
        f"{API_V2}/transactions",
        json={
            "merchant": "Assistant Test Merchant",
            "description": "Grounding fixture",
            "category": "Food",
            "amount": amount,
            "date": transaction_date,
            "type": "expense",
            "paymentMethod": "card",
            "isRecurring": False,
        },
    )
    assert response.status_code == 201, response.text


class ComparisonEchoProvider:
    def __init__(self) -> None:
        self.turn = 0

    def respond(self, **kwargs: object) -> LLMProviderTurn:
        input_items = kwargs["input_items"]
        assert isinstance(input_items, list)
        self.turn += 1
        if self.turn == 1:
            return LLMProviderTurn(
                output_items=[],
                tool_calls=[
                    LLMToolCall(
                        call_id="compare-1",
                        name="compare_periods",
                        arguments={"periodA": "2026-07", "periodB": "2026-08"},
                    )
                ],
            )

        function_output = next(
            item for item in reversed(input_items) if item.get("type") == "function_call_output"
        )
        payload = json.loads(str(function_output["output"]))
        comparison = payload["data"]
        return LLMProviderTurn(
            output_items=[],
            tool_calls=[],
            final_payload={
                "answer": f"difference={comparison['difference']}; percent={comparison['differencePercent']}",
                "evidence": [
                    {"source": "period_comparison", "reference": "2026-07_vs_2026-08"}
                ],
                "limitations": [],
            },
        )


def test_assistant_requires_authentication_and_configuration() -> None:
    with TestClient(app) as client:
        assert client.post(f"{API_V2}/assistant/query", json={"question": "How am I doing?"}).status_code == 401
        register(client, "assistant-config@example.com")
        response = client.post(f"{API_V2}/assistant/query", json={"question": "How am I doing?"})
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "financial_assistant_not_configured"


def test_request_rejects_user_id_and_comparison_is_account_isolated() -> None:
    with TestClient(app) as owner, TestClient(app) as other:
        register(owner, "assistant-owner@example.com")
        add_expense(owner, "10.10", "2026-07-10")
        add_expense(owner, "20.20", "2026-08-10")

        register(other, "assistant-other@example.com")
        add_expense(other, "999.99", "2026-08-10")

        provider = ComparisonEchoProvider()
        app.dependency_overrides[get_financial_assistant_provider] = lambda: provider

        rejected = owner.post(
            f"{API_V2}/assistant/query",
            json={"question": "Compare July and August", "userId": "attacker-selected-user"},
        )
        assert rejected.status_code == 422

        response = owner.post(
            f"{API_V2}/assistant/query",
            json={"question": "Compare July and August"},
        )
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["answer"] == "difference=10.10; percent=100.00"
        assert payload["evidence"] == [
            {
                "source": "period_comparison",
                "reference": "2026-07_vs_2026-08",
                "label": "2026-07 vs 2026-08 expense comparison",
            }
        ]
        assert payload["limitations"] == []
        assert payload["requestId"]
