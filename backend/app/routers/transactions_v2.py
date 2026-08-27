from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.core.api_errors import ApiError
from app.db.session import get_db
from app.models.user import User
from app.schemas import (
    TransactionCreateV2,
    TransactionPageV2,
    TransactionSort,
    TransactionStatus,
    TransactionType,
    TransactionUpdateV2,
    TransactionV2,
)
from app.services.transaction_categorization_service import (
    create_transaction_with_feedback,
    update_transaction_with_feedback,
)
from app.services.transaction_service import (
    TransactionInputError,
    delete_transaction,
    list_transactions,
)


router = APIRouter(prefix="/transactions", tags=["transactions-v2"])


def _transaction_v2(value) -> TransactionV2:
    return TransactionV2.model_validate(value.model_dump())


@router.get("", response_model=TransactionPageV2)
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
) -> TransactionPageV2:
    if date_from is not None and date_to is not None and date_from > date_to:
        raise ApiError(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "invalid_date_range",
            "dateFrom must be earlier than or equal to dateTo",
        )

    page_result = list_transactions(
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
    return TransactionPageV2(
        items=[_transaction_v2(item) for item in page_result.items],
        page=page_result.page,
        pageSize=page_result.pageSize,
        total=page_result.total,
        pages=page_result.pages,
    )


@router.post("", response_model=TransactionV2, status_code=status.HTTP_201_CREATED)
def post_transaction(
    payload: TransactionCreateV2,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionV2:
    try:
        return _transaction_v2(
            create_transaction_with_feedback(db, current_user.id, payload)
        )
    except TransactionInputError as exc:
        raise ApiError(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "invalid_transaction",
            str(exc),
        ) from exc


@router.put("/{transaction_id}", response_model=TransactionV2)
def put_transaction(
    transaction_id: str,
    payload: TransactionUpdateV2,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionV2:
    try:
        transaction = update_transaction_with_feedback(
            db, current_user.id, transaction_id, payload
        )
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
    return _transaction_v2(transaction)


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_transaction(
    transaction_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if not delete_transaction(db, current_user.id, transaction_id):
        raise ApiError(
            status.HTTP_404_NOT_FOUND,
            "transaction_not_found",
            "Transaction not found",
        )
