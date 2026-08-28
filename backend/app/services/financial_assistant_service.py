from __future__ import annotations

import json
from collections.abc import Callable
from datetime import date
from typing import Any
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.financial_assistant_schemas import (
    EvidenceReference,
    FinancialAssistantDraft,
    FinancialAssistantResult,
)
from app.integrations.llm.client import LLMProvider, LLMProviderError
from app.services.financial_assistant_tools import (
    ASSISTANT_TOOL_DEFINITIONS,
    AssistantToolError,
    AssistantToolResult,
    execute_assistant_tool,
)


DEFAULT_MAX_TOOL_ROUNDS = 5
DEFAULT_MAX_TOOL_CALLS = 12
ToolExecutor = Callable[[Session, UUID, str, dict[str, Any]], AssistantToolResult]


class FinancialAssistantError(RuntimeError):
    pass


class FinancialAssistantLimitError(FinancialAssistantError):
    pass


def _instructions() -> str:
    return f"""You are Financial Assistant v1 for Smart Expense AI. Today is {date.today().isoformat()}.

Architecture contract:
- You reason about and explain financial facts; backend tools calculate and decide those facts.
- Use only supplied function tools for user-specific financial facts. Never invent transactions, budgets, findings, trends, dates or amounts.
- Never calculate monetary differences, percentages, budget progress or category deltas yourself. Use the tool whose output already contains that calculation.
- `rules-v2` persisted findings are authoritative for anomaly, duplicate-subscription and recurrence findings. Do not call something fraud; describe it as a finding to review.
- historical-v2.2 is authoritative for historical trend/category-shift/recurrence evidence.
- If evidence is unavailable or stale, say so explicitly in limitations instead of filling gaps.
- The tool schemas intentionally contain no user identity. Never ask for, infer or emit an internal user id.
- Keep answers concise, useful and in the same language as the user's question.

Grounding contract:
- Each tool result contains an `evidence` array. Every evidence object in your final structured answer must copy an exact `source` and `reference` pair from executed tool results.
- Do not cite tools you did not execute.
- For general capability questions that need no financial facts, evidence may be empty.
"""


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        clean = value.strip()
        if clean and clean not in seen:
            seen.add(clean)
            result.append(clean)
    return result


def query_financial_assistant(
    db: Session,
    user_id: UUID,
    question: str,
    provider: LLMProvider,
    *,
    max_tool_rounds: int = DEFAULT_MAX_TOOL_ROUNDS,
    max_tool_calls: int = DEFAULT_MAX_TOOL_CALLS,
    tool_executor: ToolExecutor = execute_assistant_tool,
) -> FinancialAssistantResult:
    input_items: list[dict[str, Any]] = [
        {
            "role": "user",
            "content": [{"type": "input_text", "text": question}],
        }
    ]
    evidence_catalog: dict[tuple[str, str], EvidenceReference] = {}
    tool_limitations: list[str] = []
    call_count = 0
    response_schema = FinancialAssistantDraft.model_json_schema()

    for _ in range(max_tool_rounds + 1):
        turn = provider.respond(
            input_items=input_items,
            instructions=_instructions(),
            tools=ASSISTANT_TOOL_DEFINITIONS,
            response_schema=response_schema,
        )
        input_items.extend(turn.output_items)

        if turn.tool_calls:
            if call_count + len(turn.tool_calls) > max_tool_calls:
                raise FinancialAssistantLimitError("Financial Assistant exceeded its tool-call limit")
            call_count += len(turn.tool_calls)
            for call in turn.tool_calls:
                try:
                    result = tool_executor(db, user_id, call.name, call.arguments)
                    for evidence in result.evidence:
                        evidence_catalog[(evidence.source, evidence.reference)] = evidence
                    tool_limitations.extend(result.limitations)
                    output = result.as_model_payload()
                except AssistantToolError as exc:
                    output = {
                        "error": {"type": "invalid_tool_request", "message": str(exc)},
                        "evidence": [],
                        "limitations": [str(exc)],
                    }
                    tool_limitations.append(str(exc))
                input_items.append(
                    {
                        "type": "function_call_output",
                        "call_id": call.call_id,
                        "output": json.dumps(output, separators=(",", ":"), default=str),
                    }
                )
            continue

        if turn.final_payload is None:
            raise LLMProviderError("The model returned neither tool calls nor a final answer")
        try:
            draft = FinancialAssistantDraft.model_validate(turn.final_payload)
        except ValidationError as exc:
            raise LLMProviderError("The model returned an invalid Financial Assistant answer") from exc

        selected: list[EvidenceReference] = []
        selected_keys: set[tuple[str, str]] = set()
        invalid_reference = False
        for requested in draft.evidence:
            key = (requested.source, requested.reference)
            canonical = evidence_catalog.get(key)
            if canonical is None:
                invalid_reference = True
                continue
            if key not in selected_keys:
                selected.append(canonical)
                selected_keys.add(key)

        limitations = tool_limitations + draft.limitations
        if invalid_reference:
            limitations.append("One or more model-supplied evidence references were omitted because they were not produced by an executed financial tool.")
        if evidence_catalog and not selected:
            selected = list(evidence_catalog.values())
            limitations.append("Executed financial sources are shown because the model did not select a valid evidence reference.")

        return FinancialAssistantResult(
            answer=draft.answer,
            evidence=selected,
            limitations=_unique(limitations),
        )

    raise FinancialAssistantLimitError("Financial Assistant exceeded its tool-round limit")
