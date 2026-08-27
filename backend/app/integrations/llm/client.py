from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


class LLMProviderError(RuntimeError):
    """Raised when the configured LLM provider cannot produce a valid turn."""


@dataclass(frozen=True)
class LLMToolCall:
    call_id: str
    name: str
    arguments: dict[str, Any]


@dataclass(frozen=True)
class LLMProviderTurn:
    output_items: list[dict[str, Any]]
    tool_calls: list[LLMToolCall]
    final_payload: dict[str, Any] | None = None


class LLMProvider(Protocol):
    def respond(
        self,
        *,
        input_items: list[dict[str, Any]],
        instructions: str,
        tools: list[dict[str, Any]],
        response_schema: dict[str, Any],
    ) -> LLMProviderTurn:
        ...
