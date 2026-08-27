from __future__ import annotations

from functools import lru_cache
from uuid import uuid4

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.core.api_errors import ApiError
from app.core.config import settings
from app.db.session import get_db
from app.financial_assistant_schemas import FinancialAssistantAnswer, FinancialAssistantQuery
from app.integrations.llm.client import LLMProvider, LLMProviderError
from app.integrations.llm.openai_provider import OpenAIResponsesProvider
from app.models.user import User
from app.services.financial_assistant_service import (
    FinancialAssistantLimitError,
    query_financial_assistant,
)


router = APIRouter(prefix="/assistant", tags=["financial-assistant-v2"])


@lru_cache
def _configured_provider() -> LLMProvider | None:
    if not settings.openai_api_key:
        return None
    return OpenAIResponsesProvider(
        api_key=settings.openai_api_key,
        model=settings.financial_assistant_model,
        reasoning_effort=settings.financial_assistant_reasoning_effort,
        max_output_tokens=settings.financial_assistant_max_output_tokens,
    )


def get_financial_assistant_provider() -> LLMProvider | None:
    return _configured_provider()


@router.post("/query", response_model=FinancialAssistantAnswer)
def query_assistant(
    payload: FinancialAssistantQuery,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    provider: LLMProvider | None = Depends(get_financial_assistant_provider),
) -> FinancialAssistantAnswer:
    if provider is None:
        raise ApiError(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "financial_assistant_not_configured",
            "Financial Assistant is not configured on this environment",
        )
    try:
        result = query_financial_assistant(
            db,
            current_user.id,
            payload.question,
            provider,
            max_tool_rounds=settings.financial_assistant_max_tool_rounds,
            max_tool_calls=settings.financial_assistant_max_tool_calls,
        )
    except FinancialAssistantLimitError as exc:
        raise ApiError(
            status.HTTP_502_BAD_GATEWAY,
            "financial_assistant_tool_limit",
            "Financial Assistant could not complete the request within its bounded tool budget",
        ) from exc
    except LLMProviderError as exc:
        raise ApiError(
            status.HTTP_502_BAD_GATEWAY,
            "financial_assistant_provider_error",
            "Financial Assistant provider failed to produce a valid response",
        ) from exc

    request_id = getattr(request.state, "request_id", None) or str(uuid4())
    return FinancialAssistantAnswer(**result.model_dump(), requestId=request_id)
