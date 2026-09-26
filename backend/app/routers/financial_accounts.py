from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.core.api_errors import ApiError
from app.db.session import get_db
from app.financial_account_schemas import (
    FinancialAccountBalanceRequest,
    FinancialAccountBalanceSnapshotResponse,
    FinancialAccountCreateRequest,
    FinancialAccountResponse,
    FinancialAccountUpdateRequest,
    NetWorthHistoryResponse,
    NetWorthSummaryResponse,
)
from app.models.user import User
from app.services.financial_account_service import (
    archive_financial_account,
    create_financial_account,
    get_net_worth_history,
    get_net_worth_summary,
    list_financial_accounts,
    record_financial_account_balance,
    update_financial_account,
)


router = APIRouter(tags=["financial-accounts-v2"])


@router.get("/financial-accounts", response_model=list[FinancialAccountResponse])
def get_financial_accounts(
    include_archived: bool = Query(False, alias="includeArchived"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[FinancialAccountResponse]:
    return list_financial_accounts(db, current_user.id, include_archived=include_archived)


@router.post(
    "/financial-accounts",
    response_model=FinancialAccountResponse,
    status_code=status.HTTP_201_CREATED,
)
def post_financial_account(
    payload: FinancialAccountCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FinancialAccountResponse:
    try:
        return create_financial_account(db, current_user.id, payload)
    except ValueError as exc:
        raise ApiError(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid_financial_account", str(exc)) from exc


@router.patch("/financial-accounts/{account_id}", response_model=FinancialAccountResponse)
def patch_financial_account(
    account_id: UUID,
    payload: FinancialAccountUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FinancialAccountResponse:
    try:
        account = update_financial_account(db, current_user.id, account_id, payload)
    except ValueError as exc:
        raise ApiError(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid_financial_account", str(exc)) from exc
    if account is None:
        raise ApiError(status.HTTP_404_NOT_FOUND, "financial_account_not_found", "Financial account not found")
    return account


@router.delete("/financial-accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_financial_account(
    account_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if not archive_financial_account(db, current_user.id, account_id):
        raise ApiError(status.HTTP_404_NOT_FOUND, "financial_account_not_found", "Financial account not found")


@router.post(
    "/financial-accounts/{account_id}/balance",
    response_model=FinancialAccountBalanceSnapshotResponse,
    status_code=status.HTTP_201_CREATED,
)
def post_financial_account_balance(
    account_id: UUID,
    payload: FinancialAccountBalanceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FinancialAccountBalanceSnapshotResponse:
    result = record_financial_account_balance(db, current_user.id, account_id, payload.balance)
    if result is None:
        raise ApiError(status.HTTP_404_NOT_FOUND, "financial_account_not_found", "Financial account not found")
    _, snapshot = result
    return snapshot


@router.get("/net-worth/summary", response_model=NetWorthSummaryResponse)
def get_current_net_worth_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NetWorthSummaryResponse:
    return get_net_worth_summary(db, current_user.id)


@router.get("/net-worth/history", response_model=NetWorthHistoryResponse)
def get_current_net_worth_history(
    months: int = Query(12, ge=1, le=120),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NetWorthHistoryResponse:
    return get_net_worth_history(db, current_user.id, months)
