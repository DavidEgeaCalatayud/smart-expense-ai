from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.core.api_errors import ApiError
from app.db.session import get_db
from app.models.user import User
from app.schemas import (
    Transaction,
    TransactionCreate,
    TransactionPage,
    TransactionSort,
    TransactionStatus,
    TransactionType,
    TransactionUpdate,
)
from app.services.transaction_service import (
    TransactionInputError,
    create_transaction,
    delete_transaction,
    list_transactions,
    update_transaction,
)

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", response_model=TransactionPage)
def get_transactions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, alias="pageSize", ge=1, le=100),
    search: str | None = Query(None, min_length=1, max_length=120),
    category: str | None = Query(None, min_length=1, max_length=80),
    transaction_status: TransactionStatus | None = Query(None, alias="status"),
    transaction_type: TransactionType | None = Query(None, alias="type"),
    recurring: bool | None = Query(None),
    date_from: date | None = Query(None, alias="dateFrom"),
    date_to: date | None = Query(None, alias="dateTo"),
    sort: TransactionSort = Query(TransactionSort.newest),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionPage:
    if date_from is not None and date_to is not None and date_from > date_to:
        raise ApiError(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "invalid_date_range",
            "dateFrom must be earlier than or equal to dateTo",
        )

    return list_transactions(
        db,
        current_user.id,
        page=page,
        page_size=page_size,
        search=search,
        category=category,
        status=transaction_status,
        transaction_type=transaction_type,
        recurring=recurring,
        date_from=date_from,
        date_to=date_to,
        sort=sort,
    )


@router.post("", response_model=Transaction, status_code=status.HTTP_201_CREATED)
def post_transaction(
    payload: TransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Transaction:
    try:
        return create_transaction(db, current_user.id, payload)
    except TransactionInputError as exc:
        raise ApiError(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "invalid_transaction",
            str(exc),
        ) from exc


@router.put("/{transaction_id}", response_model=Transaction)
def put_transaction(
    transaction_id: str,
    payload: TransactionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Transaction:
    try:
        transaction = update_transaction(db, current_user.id, transaction_id, payload)
    except TransactionInputError as exc:
        raise ApiError(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "invalid_transaction",
            str(exc),
        ) from exc

    if transaction is None:
        raise ApiError(
            status.HTTP_404_NOT_FOUND,
            "transaction_not_found",
            "Transaction not found",
        )

    return transaction


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_transaction(
    transaction_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    deleted = delete_transaction(db, current_user.id, transaction_id)

    if not deleted:
        raise ApiError(
            status.HTTP_404_NOT_FOUND,
            "transaction_not_found",
            "Transaction not found",
        )
