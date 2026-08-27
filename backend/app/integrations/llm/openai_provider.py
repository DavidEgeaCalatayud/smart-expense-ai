from __future__ import annotations

import json
from typing import Any

from openai import OpenAI, OpenAIError

from app.integrations.llm.client import LLMProviderError, LLMProviderTurn, LLMToolCall


class OpenAIResponsesProvider:
    """Stateless Responses API adapter.

    The caller replays returned output items inside one HTTP request. `store=False`
    therefore does not rely on persistent provider-side conversation state.
    """

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        reasoning_effort: str = "low",
        max_output_tokens: int = 1600,
    ) -> None:
        self._client = OpenAI(api_key=api_key)
        self._model = model
        self._reasoning_effort = reasoning_effort
        self._max_output_tokens = max_output_tokens

    def respond(
        self,
        *,
        input_items: list[dict[str, Any]],
        instructions: str,
        tools: list[dict[str, Any]],
        response_schema: dict[str, Any],
    ) -> LLMProviderTurn:
        try:
            response = self._client.responses.create(
                model=self._model,
                instructions=instructions,
                input=input_items,
                tools=tools,
                tool_choice="auto",
                parallel_tool_calls=True,
                reasoning={"effort": self._reasoning_effort},
                max_output_tokens=self._max_output_tokens,
                store=False,
                include=["reasoning.encrypted_content"],
                text={
                    "verbosity": "low",
                    "format": {
                        "type": "json_schema",
                        "name": "financial_assistant_answer",
                        "strict": True,
                        "schema": response_schema,
                    },
                },
            )
        except OpenAIError as exc:
            raise LLMProviderError("The Financial Assistant provider request failed") from exc

        output_items = [
            item.model_dump(mode="json", exclude_none=True)
            for item in response.output
        ]
        tool_calls: list[LLMToolCall] = []
        for item in response.output:
            if getattr(item, "type", None) != "function_call":
                continue
            try:
                arguments = json.loads(item.arguments)
            except (TypeError, json.JSONDecodeError) as exc:
                raise LLMProviderError("The model returned invalid tool arguments") from exc
            if not isinstance(arguments, dict):
                raise LLMProviderError("The model returned non-object tool arguments")
            tool_calls.append(
                LLMToolCall(
                    call_id=item.call_id,
                    name=item.name,
                    arguments=arguments,
                )
            )

        if tool_calls:
            return LLMProviderTurn(output_items=output_items, tool_calls=tool_calls)

        try:
            payload = json.loads(response.output_text)
        except (TypeError, json.JSONDecodeError) as exc:
            raise LLMProviderError("The model returned an invalid structured answer") from exc
        if not isinstance(payload, dict):
            raise LLMProviderError("The model returned a non-object structured answer")
        return LLMProviderTurn(
            output_items=output_items,
            tool_calls=[],
            final_payload=payload,
        )
