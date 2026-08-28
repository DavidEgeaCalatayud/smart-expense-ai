from __future__ import annotations

import json
from uuid import UUID

from app.financial_assistant_schemas import EvidenceReference
from app.integrations.llm.client import LLMProviderTurn, LLMToolCall
from app.services.financial_assistant_service import query_financial_assistant
from app.services.financial_assistant_tools import (
    ASSISTANT_TOOL_DEFINITIONS,
    AssistantToolResult,
)


class FakeProvider:
    def __init__(self, turns: list[LLMProviderTurn]) -> None:
        self.turns = list(turns)
        self.seen_inputs: list[list[dict[str, object]]] = []

    def respond(self, **kwargs: object) -> LLMProviderTurn:
        input_items = kwargs["input_items"]
        assert isinstance(input_items, list)
        self.seen_inputs.append(json.loads(json.dumps(input_items)))
        return self.turns.pop(0)


def test_tool_contracts_never_expose_user_identity_and_are_strict() -> None:
    assert {tool["name"] for tool in ASSISTANT_TOOL_DEFINITIONS} == {
        "get_financial_summary",
        "compare_periods",
        "get_budget_progress",
        "get_financial_findings",
        "get_historical_insights",
        "search_transactions",
    }
    for tool in ASSISTANT_TOOL_DEFINITIONS:
        parameters = tool["parameters"]
        properties = parameters["properties"]
        normalized = {key.casefold().replace("_", "") for key in properties}
        assert "userid" not in normalized
        assert parameters["additionalProperties"] is False
        assert set(parameters["required"]) == set(properties)
        assert tool["strict"] is True


def test_service_pins_user_scope_and_filters_unexecuted_evidence() -> None:
    user_id = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    provider = FakeProvider(
        [
            LLMProviderTurn(
                output_items=[
                    {
                        "type": "function_call",
                        "call_id": "call-summary",
                        "name": "get_financial_summary",
                        "arguments": '{"dateFrom":null,"dateTo":null}',
                    }
                ],
                tool_calls=[
                    LLMToolCall(
                        call_id="call-summary",
                        name="get_financial_summary",
                        arguments={"dateFrom": None, "dateTo": None},
                    )
                ],
            ),
            LLMProviderTurn(
                output_items=[],
                tool_calls=[],
                final_payload={
                    "answer": "Your exact summary is grounded in transaction analytics.",
                    "evidence": [
                        {"source": "financial_summary", "reference": "all:all"},
                        {"source": "budget", "reference": "2099-01"},
                    ],
                    "limitations": [],
                },
            ),
        ]
    )
    seen_user_ids: list[UUID] = []

    def fake_executor(db: object, scoped_user_id: UUID, name: str, arguments: dict[str, object]) -> AssistantToolResult:
        seen_user_ids.append(scoped_user_id)
        assert name == "get_financial_summary"
        assert arguments == {"dateFrom": None, "dateTo": None}
        return AssistantToolResult(
            data={"totalExpenses": "10.00"},
            evidence=[EvidenceReference(source="financial_summary", reference="all:all", label="Transaction analytics summary")],
            limitations=[],
        )

    result = query_financial_assistant(
        object(),  # type: ignore[arg-type]
        user_id,
        "How am I doing?",
        provider,
        tool_executor=fake_executor,  # type: ignore[arg-type]
    )

    assert seen_user_ids == [user_id]
    assert [(item.source, item.reference) for item in result.evidence] == [
        ("financial_summary", "all:all")
    ]
    assert any("were omitted" in item for item in result.limitations)
    serialized_provider_context = json.dumps(provider.seen_inputs)
    assert str(user_id) not in serialized_provider_context


def test_service_falls_back_to_executed_evidence_when_model_selects_none() -> None:
    provider = FakeProvider(
        [
            LLMProviderTurn(
                output_items=[],
                tool_calls=[
                    LLMToolCall(
                        call_id="call-budget",
                        name="get_budget_progress",
                        arguments={"month": "2026-08"},
                    )
                ],
            ),
            LLMProviderTurn(
                output_items=[],
                tool_calls=[],
                final_payload={"answer": "Budget checked.", "evidence": [], "limitations": []},
            ),
        ]
    )

    def fake_executor(db: object, user_id: UUID, name: str, arguments: dict[str, object]) -> AssistantToolResult:
        return AssistantToolResult(
            data={"month": "2026-08"},
            evidence=[EvidenceReference(source="budget", reference="2026-08", label="2026-08 budget progress")],
            limitations=[],
        )

    result = query_financial_assistant(
        object(),  # type: ignore[arg-type]
        UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
        "How is my budget?",
        provider,
        tool_executor=fake_executor,  # type: ignore[arg-type]
    )
    assert result.evidence[0].reference == "2026-08"
    assert any("Executed financial sources are shown" in item for item in result.limitations)
