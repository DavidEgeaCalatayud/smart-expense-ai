from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.financial_assistant_schemas import EvidenceReference
from app.services.financial_account_service import (
    get_financial_accounts_summary,
    get_net_worth_history,
    get_net_worth_summary,
)
from app.services.financial_assistant_tools import AssistantToolError, AssistantToolResult


NET_WORTH_TOOL_DEFINITION: dict[str, Any] = {
    "type": "function",
    "name": "get_net_worth_summary",
    "description": (
        "Return the authenticated user's current manually maintained net worth, "
        "including available, reserved, invested and purpose-level amounts."
    ),
    "strict": True,
    "parameters": {
        "type": "object",
        "properties": {},
        "required": [],
        "additionalProperties": False,
    },
}

NET_WORTH_HISTORY_TOOL_DEFINITION: dict[str, Any] = {
    "type": "function",
    "name": "get_net_worth_history",
    "description": (
        "Return backend-computed daily net-worth history and change for a requested number "
        "of months. Use this for questions about how the user's net worth changed over time."
    ),
    "strict": True,
    "parameters": {
        "type": "object",
        "properties": {
            "months": {"type": "integer", "minimum": 1, "maximum": 120},
        },
        "required": ["months"],
        "additionalProperties": False,
    },
}

FINANCIAL_ACCOUNTS_SUMMARY_TOOL_DEFINITION: dict[str, Any] = {
    "type": "function",
    "name": "get_financial_accounts_summary",
    "description": (
        "Return the user's current included financial accounts ranked by balance, with "
        "backend-computed account shares, invested percentage and opportunity capital."
    ),
    "strict": True,
    "parameters": {
        "type": "object",
        "properties": {},
        "required": [],
        "additionalProperties": False,
    },
}

NET_WORTH_TOOL_DEFINITIONS = [
    NET_WORTH_TOOL_DEFINITION,
    NET_WORTH_HISTORY_TOOL_DEFINITION,
    FINANCIAL_ACCOUNTS_SUMMARY_TOOL_DEFINITION,
]


def _reject_identity(arguments: dict[str, Any]) -> None:
    if any(key.casefold().replace("_", "") == "userid" for key in arguments):
        raise AssistantToolError("user identity is not a valid tool argument")


def execute_net_worth_tool(
    db: Session,
    user_id: UUID,
    arguments: dict[str, Any],
) -> AssistantToolResult:
    _reject_identity(arguments)
    if arguments:
        raise AssistantToolError("get_net_worth_summary does not accept arguments")

    summary = get_net_worth_summary(db, user_id)
    return AssistantToolResult(
        data=summary.model_dump(mode="json"),
        evidence=[
            EvidenceReference(
                source="net_worth_summary",
                reference="current",
                label="Current manually maintained net-worth summary",
            )
        ],
        limitations=[
            "Net worth is based on balances the user entered manually; Smart Expense AI does not connect to financial institutions."
        ],
    )


def execute_net_worth_history_tool(
    db: Session,
    user_id: UUID,
    arguments: dict[str, Any],
) -> AssistantToolResult:
    _reject_identity(arguments)
    if set(arguments) != {"months"}:
        raise AssistantToolError("get_net_worth_history requires only the months argument")
    months = arguments.get("months")
    if isinstance(months, bool) or not isinstance(months, int) or not 1 <= months <= 120:
        raise AssistantToolError("months must be an integer between 1 and 120")

    history = get_net_worth_history(db, user_id, months)
    return AssistantToolResult(
        data=history.model_dump(mode="json"),
        evidence=[
            EvidenceReference(
                source="net_worth_history",
                reference=f"{months}-months",
                label=f"Daily manually maintained net-worth history for {months} months",
            )
        ],
        limitations=[
            "Net-worth history is reconstructed from user-entered balance and inclusion observations, not live bank data.",
            "Net-worth change includes account additions, removals, deposits, withdrawals and transfers; it is not investment return.",
        ],
    )


def execute_financial_accounts_summary_tool(
    db: Session,
    user_id: UUID,
    arguments: dict[str, Any],
) -> AssistantToolResult:
    _reject_identity(arguments)
    if arguments:
        raise AssistantToolError("get_financial_accounts_summary does not accept arguments")

    summary = get_financial_accounts_summary(db, user_id)
    return AssistantToolResult(
        data=summary.model_dump(mode="json"),
        evidence=[
            EvidenceReference(
                source="financial_accounts_summary",
                reference="current",
                label="Current manually maintained financial-account ranking and shares",
            )
        ],
        limitations=[
            "Account balances are entered manually and may be stale between user updates."
        ],
    )
