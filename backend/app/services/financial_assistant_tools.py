from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy.orm import Session

from app.financial_assistant_schemas import EvidenceReference
from app.schemas import FindingStatus, FindingType, TransactionSort, TransactionType
from app.services.budget_service import BudgetInputError, get_budget_month
from app.services.financial_comparison_service import (
    FinancialComparisonInputError,
    compare_months,
)
from app.services.historical_analysis_v2_2 import get_latest_historical_analysis
from app.services.intelligence_service import get_intelligence_summary, list_findings
from app.services.transaction_service import list_transactions, summarize_transactions


MAX_TRANSACTION_SEARCH_RESULTS = 50


class AssistantToolError(ValueError):
    pass


@dataclass(frozen=True)
class AssistantToolResult:
    data: dict[str, Any]
    evidence: list[EvidenceReference]
    limitations: list[str]

    def as_model_payload(self) -> dict[str, Any]:
        return {
            "data": self.data,
            "evidence": [item.model_dump(mode="json") for item in self.evidence],
            "limitations": self.limitations,
        }


class _ToolArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SummaryArgs(_ToolArgs):
    dateFrom: date | None
    dateTo: date | None


class CompareArgs(_ToolArgs):
    periodA: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    periodB: str = Field(..., pattern=r"^\d{4}-\d{2}$")


class BudgetArgs(_ToolArgs):
    month: str = Field(..., pattern=r"^\d{4}-\d{2}$")


class FindingsArgs(_ToolArgs):
    status: Literal["open", "dismissed", "resolved", "all"]
    findingTypes: list[FindingType] | None
    limit: int = Field(..., ge=1, le=30)


class HistoricalArgs(_ToolArgs):
    months: int = Field(..., ge=1, le=24)


class TransactionSearchArgs(_ToolArgs):
    query: str | None
    category: str | None
    transactionType: TransactionType | None
    recurring: bool | None
    dateFrom: date | None
    dateTo: date | None
    sort: TransactionSort
    limit: int = Field(..., ge=1, le=MAX_TRANSACTION_SEARCH_RESULTS)


def _nullable_string(description: str) -> dict[str, Any]:
    return {"type": ["string", "null"], "description": description}


def _strict_tool(name: str, description: str, properties: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "function",
        "name": name,
        "description": description,
        "strict": True,
        "parameters": {
            "type": "object",
            "properties": properties,
            "required": list(properties),
            "additionalProperties": False,
        },
    }


ASSISTANT_TOOL_DEFINITIONS: list[dict[str, Any]] = [
    _strict_tool(
        "get_financial_summary",
        "Return exact income, expense, balance and transaction counts for an optional date range.",
        {
            "dateFrom": _nullable_string("Inclusive YYYY-MM-DD start date, or null."),
            "dateTo": _nullable_string("Inclusive YYYY-MM-DD end date, or null."),
        },
    ),
    _strict_tool(
        "compare_periods",
        "Compare two calendar months with server-computed exact expense difference, percentage change and category deltas.",
        {
            "periodA": {"type": "string", "pattern": r"^\d{4}-\d{2}$", "description": "Earlier or baseline YYYY-MM month."},
            "periodB": {"type": "string", "pattern": r"^\d{4}-\d{2}$", "description": "Comparison YYYY-MM month."},
        },
    ),
    _strict_tool(
        "get_budget_progress",
        "Return server-computed overall and per-category budget progress for a calendar month.",
        {"month": {"type": "string", "pattern": r"^\d{4}-\d{2}$", "description": "YYYY-MM month."}},
    ),
    _strict_tool(
        "get_financial_findings",
        "Read persisted rules-v2 financial intelligence findings without running or mutating a scan.",
        {
            "status": {"type": "string", "enum": ["open", "dismissed", "resolved", "all"]},
            "findingTypes": {
                "type": ["array", "null"],
                "items": {"type": "string", "enum": [item.value for item in FindingType]},
                "description": "Optional finding types to retain, or null for all types.",
            },
            "limit": {"type": "integer", "minimum": 1, "maximum": 30},
        },
    ),
    _strict_tool(
        "get_historical_insights",
        "Read the latest persisted historical-v2.2 analysis and return bounded historical evidence.",
        {"months": {"type": "integer", "minimum": 1, "maximum": 24}},
    ),
    _strict_tool(
        "search_transactions",
        "Search only the authenticated user's transactions with bounded filters and result count.",
        {
            "query": _nullable_string("Merchant/description search text, or null."),
            "category": _nullable_string("Exact category name, or null."),
            "transactionType": {"type": ["string", "null"], "enum": ["expense", "income", None]},
            "recurring": {"type": ["boolean", "null"]},
            "dateFrom": _nullable_string("Inclusive YYYY-MM-DD start date, or null."),
            "dateTo": _nullable_string("Inclusive YYYY-MM-DD end date, or null."),
            "sort": {"type": "string", "enum": [item.value for item in TransactionSort]},
            "limit": {"type": "integer", "minimum": 1, "maximum": MAX_TRANSACTION_SEARCH_RESULTS},
        },
    ),
]


def _money(value: object) -> str:
    return format(Decimal(str(value)).quantize(Decimal("0.01")), "f")


def _validate_range(date_from: date | None, date_to: date | None) -> None:
    if date_from is not None and date_to is not None and date_from > date_to:
        raise AssistantToolError("dateFrom must be earlier than or equal to dateTo")


def _parse(model: type[_ToolArgs], arguments: dict[str, Any]) -> _ToolArgs:
    if any(key.casefold().replace("_", "") == "userid" for key in arguments):
        raise AssistantToolError("user identity is not a valid tool argument")
    try:
        return model.model_validate(arguments)
    except ValidationError as exc:
        raise AssistantToolError("Invalid assistant tool arguments") from exc


def _summary(db: Session, user_id: UUID, arguments: dict[str, Any]) -> AssistantToolResult:
    args = _parse(SummaryArgs, arguments)
    assert isinstance(args, SummaryArgs)
    _validate_range(args.dateFrom, args.dateTo)
    summary = summarize_transactions(db, user_id, date_from=args.dateFrom, date_to=args.dateTo)
    start = args.dateFrom.isoformat() if args.dateFrom else "all"
    end = args.dateTo.isoformat() if args.dateTo else "all"
    return AssistantToolResult(
        data={
            "dateFrom": None if args.dateFrom is None else args.dateFrom.isoformat(),
            "dateTo": None if args.dateTo is None else args.dateTo.isoformat(),
            "totalIncome": _money(summary.totalIncome),
            "totalExpenses": _money(summary.totalExpenses),
            "balance": _money(summary.balance),
            "recurringCount": summary.recurringCount,
            "reviewCount": summary.reviewCount,
            "transactionCount": summary.transactionCount,
        },
        evidence=[EvidenceReference(source="financial_summary", reference=f"{start}:{end}", label="Transaction analytics summary")],
        limitations=[],
    )


def _comparison(db: Session, user_id: UUID, arguments: dict[str, Any]) -> AssistantToolResult:
    args = _parse(CompareArgs, arguments)
    assert isinstance(args, CompareArgs)
    try:
        comparison = compare_months(db, user_id, args.periodA, args.periodB)
    except FinancialComparisonInputError as exc:
        raise AssistantToolError(str(exc)) from exc
    period_a = comparison["periodA"]
    period_b = comparison["periodB"]
    changes = comparison["topCategoryChanges"]
    assert isinstance(period_a, dict) and isinstance(period_b, dict) and isinstance(changes, list)
    payload = {
        "periodA": {**period_a, "expenses": _money(period_a["expenses"]), "income": _money(period_a["income"]), "balance": _money(period_a["balance"])},
        "periodB": {**period_b, "expenses": _money(period_b["expenses"]), "income": _money(period_b["income"]), "balance": _money(period_b["balance"])},
        "difference": _money(comparison["difference"]),
        "differencePercent": None if comparison["differencePercent"] is None else format(Decimal(str(comparison["differencePercent"])), "f"),
        "topCategoryChanges": [
            {
                **item,
                "periodAExpenses": _money(item["periodAExpenses"]),
                "periodBExpenses": _money(item["periodBExpenses"]),
                "difference": _money(item["difference"]),
            }
            for item in changes
        ],
    }
    limitations = []
    if comparison["differencePercent"] is None:
        limitations.append("Percentage change is unavailable because period A expenses are zero.")
    return AssistantToolResult(
        data=payload,
        evidence=[EvidenceReference(source="period_comparison", reference=f"{args.periodA}_vs_{args.periodB}", label=f"{args.periodA} vs {args.periodB} expense comparison")],
        limitations=limitations,
    )


def _budget(db: Session, user_id: UUID, arguments: dict[str, Any]) -> AssistantToolResult:
    args = _parse(BudgetArgs, arguments)
    assert isinstance(args, BudgetArgs)
    try:
        month = get_budget_month(db, user_id, args.month)
    except BudgetInputError as exc:
        raise AssistantToolError(str(exc)) from exc
    return AssistantToolResult(
        data=month.model_dump(mode="json"),
        evidence=[EvidenceReference(source="budget", reference=args.month, label=f"{args.month} budget progress")],
        limitations=[] if month.totalBudget or month.categoryBudgets else ["No budgets are configured for this month."],
    )


def _findings(db: Session, user_id: UUID, arguments: dict[str, Any]) -> AssistantToolResult:
    args = _parse(FindingsArgs, arguments)
    assert isinstance(args, FindingsArgs)
    status = None if args.status == "all" else FindingStatus(args.status)
    findings = list_findings(db, user_id, status=status)
    if args.findingTypes is not None:
        allowed = set(args.findingTypes)
        findings = [item for item in findings if item.type in allowed]
    findings = findings[: args.limit]
    summary = get_intelligence_summary(db, user_id)
    return AssistantToolResult(
        data={
            "ruleVersion": summary.ruleVersion,
            "lastScanAt": None if summary.lastScanAt is None else summary.lastScanAt.isoformat(),
            "analyzedTransactions": summary.analyzedTransactions,
            "findings": [item.model_dump(mode="json") for item in findings],
        },
        evidence=[EvidenceReference(source="financial_findings", reference=args.status, label=f"Persisted rules-v2 findings ({args.status})")],
        limitations=[] if summary.lastScanAt else ["No persisted financial-intelligence scan has been generated yet."],
    )


def _historical(db: Session, user_id: UUID, arguments: dict[str, Any]) -> AssistantToolResult:
    args = _parse(HistoricalArgs, arguments)
    assert isinstance(args, HistoricalArgs)
    latest = get_latest_historical_analysis(db, user_id)
    if latest is None:
        return AssistantToolResult(
            data={"available": False},
            evidence=[EvidenceReference(source="historical_analysis", reference="not-generated", label="Historical analysis availability")],
            limitations=["No persisted historical-v2.2 analysis has been generated yet."],
        )
    requested = min(args.months, latest.windowMonths)
    monthly = latest.monthlySpend[-requested:]
    return AssistantToolResult(
        data={
            "available": True,
            "snapshotId": latest.snapshotId,
            "analysisVersion": latest.analysisVersion,
            "analysisWindowMonths": latest.windowMonths,
            "requestedMonths": args.months,
            "periodStart": latest.periodStart,
            "periodEnd": latest.periodEnd,
            "generatedAt": latest.generatedAt.isoformat(),
            "monthlySpend": [item.model_dump(mode="json") for item in monthly],
            "trend": latest.trend.model_dump(mode="json"),
            "categoryShifts": [item.model_dump(mode="json") for item in latest.categoryShifts[:12]],
            "recurringProfiles": [item.model_dump(mode="json") for item in latest.recurringProfiles[:12]],
            "outliers": [item.model_dump(mode="json") for item in latest.outliers[:12]],
            "coverage": latest.coverage.model_dump(mode="json"),
        },
        evidence=[EvidenceReference(source="historical_analysis", reference=latest.snapshotId, label=f"Historical-v2.2 snapshot through {latest.periodEnd}")],
        limitations=[] if args.months <= latest.windowMonths else [f"The latest historical snapshot covers {latest.windowMonths} months, fewer than the {args.months} months requested."],
    )


def _transactions(db: Session, user_id: UUID, arguments: dict[str, Any]) -> AssistantToolResult:
    args = _parse(TransactionSearchArgs, arguments)
    assert isinstance(args, TransactionSearchArgs)
    _validate_range(args.dateFrom, args.dateTo)
    page = list_transactions(
        db,
        user_id,
        page=1,
        page_size=args.limit,
        search=args.query,
        category=args.category,
        transaction_type=args.transactionType,
        recurring=args.recurring,
        date_from=args.dateFrom,
        date_to=args.dateTo,
        sort=args.sort,
    )
    normalized_args = json.dumps(arguments, sort_keys=True, separators=(",", ":"), default=str)
    reference = hashlib.sha256(normalized_args.encode("utf-8")).hexdigest()[:12]
    items = []
    for item in page.items:
        payload = item.model_dump(mode="python")
        payload["amount"] = _money(item.amount)
        payload["type"] = item.type.value
        payload["paymentMethod"] = item.paymentMethod.value
        payload["status"] = item.status.value
        items.append(payload)
    return AssistantToolResult(
        data={"items": items, "returned": len(items), "total": page.total},
        evidence=[EvidenceReference(source="transaction_search", reference=reference, label=f"Transaction search ({page.total} matches)")],
        limitations=[] if page.total <= args.limit else [f"Search returned the first {args.limit} of {page.total} matching transactions."],
    )


_EXECUTORS = {
    "get_financial_summary": _summary,
    "compare_periods": _comparison,
    "get_budget_progress": _budget,
    "get_financial_findings": _findings,
    "get_historical_insights": _historical,
    "search_transactions": _transactions,
}


def execute_assistant_tool(
    db: Session,
    user_id: UUID,
    name: str,
    arguments: dict[str, Any],
) -> AssistantToolResult:
    executor = _EXECUTORS.get(name)
    if executor is None:
        raise AssistantToolError(f"Unknown Financial Assistant tool: {name}")
    return executor(db, user_id, arguments)
