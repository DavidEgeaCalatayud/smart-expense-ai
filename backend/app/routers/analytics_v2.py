from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.core.api_errors import ApiError
from app.db.session import get_db
from app.models.user import User
from app.schemas import MonthlyExpenseV2, TransactionSummaryV2
from app.services.transaction_service import monthly_expenses, summarize_transactions


router = APIRouter(prefix="/analytics", tags=["analytics-v2"])


def _validate_date_range(date_from: date | None, date_to: date | None) -> None:
    if date_from is not None and date_to is not None and date_from > date_to:
        raise ApiError(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "invalid_date_range",
            "dateFrom must be earlier than or equal to dateTo",
        )


@router.get("/summary", response_model=TransactionSummaryV2)
def get_summary(
    date_from: date | None = Query(None, alias="dateFrom"),
    date_to: date | None = Query(None, alias="dateTo"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionSummaryV2:
    _validate_date_range(date_from, date_to)
    summary = summarize_transactions(
        db,
        current_user.id,
        date_from=date_from,
        date_to=date_to,
    )
    return TransactionSummaryV2.model_validate(summary.model_dump())


@router.get("/monthly-expenses", response_model=list[MonthlyExpenseV2])
def get_monthly_expenses(
    months: int = Query(6, ge=1, le=24),
    through: date | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[MonthlyExpenseV2]:
    points = monthly_expenses(
        db,
        current_user.id,
        months=months,
        through=through or date.today(),
    )
    return [MonthlyExpenseV2.model_validate(point.model_dump()) for point in points]
