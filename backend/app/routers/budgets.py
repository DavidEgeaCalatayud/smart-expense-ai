from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.budget_schemas import (
    BudgetCreateRequest,
    BudgetDefinitionResponse,
    BudgetMonthResponse,
    BudgetUpdateRequest,
)
from app.core.api_errors import ApiError
from app.db.session import get_db
from app.models.user import User
from app.services.budget_service import (
    BudgetConflictError,
    BudgetInputError,
    create_budget,
    delete_budget,
    get_budget_month,
    update_budget,
)


router = APIRouter(prefix="/budgets", tags=["budgets-v2"])


def _raise_budget_error(exc: Exception) -> None:
    if isinstance(exc, BudgetConflictError):
        raise ApiError(status.HTTP_409_CONFLICT, "budget_conflict", str(exc)) from exc
    raise ApiError(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid_budget", str(exc)) from exc


@router.get("", response_model=BudgetMonthResponse)
def get_budgets(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BudgetMonthResponse:
    try:
        return get_budget_month(db, current_user.id, month)
    except BudgetInputError as exc:
        _raise_budget_error(exc)
        raise AssertionError("unreachable")


@router.post("", response_model=BudgetDefinitionResponse, status_code=status.HTTP_201_CREATED)
def post_budget(
    payload: BudgetCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BudgetDefinitionResponse:
    try:
        return create_budget(
            db,
            current_user.id,
            payload.month,
            payload.categoryId,
            payload.limitAmount,
        )
    except (BudgetConflictError, BudgetInputError) as exc:
        _raise_budget_error(exc)
        raise AssertionError("unreachable")


@router.put("/{budget_id}", response_model=BudgetDefinitionResponse)
def put_budget(
    budget_id: str,
    payload: BudgetUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BudgetDefinitionResponse:
    budget = update_budget(db, current_user.id, budget_id, payload.limitAmount)
    if budget is None:
        raise ApiError(status.HTTP_404_NOT_FOUND, "budget_not_found", "Budget not found")
    return budget


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_budget(
    budget_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if not delete_budget(db, current_user.id, budget_id):
        raise ApiError(status.HTTP_404_NOT_FOUND, "budget_not_found", "Budget not found")
