from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.financial_assistant_schemas import EvidenceReference
from app.services.financial_account_service import get_net_worth_summary
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


def execute_net_worth_tool(
    db: Session,
    user_id: UUID,
    arguments: dict[str, Any],
) -> AssistantToolResult:
    if arguments:
        if any(key.casefold().replace("_", "") == "userid" for key in arguments):
            raise AssistantToolError("user identity is not a valid tool argument")
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
