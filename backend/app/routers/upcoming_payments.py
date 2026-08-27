from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services.upcoming_payments import get_upcoming_payments
from app.upcoming_payments_schemas import UpcomingPaymentsResponse


router = APIRouter(
    prefix="/intelligence/upcoming-payments",
    tags=["upcoming-payments-v2"],
)


@router.get("", response_model=UpcomingPaymentsResponse)
def upcoming_payments(
    days: int = Query(30, ge=1, le=90),
    as_of: date | None = Query(None, alias="asOf"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UpcomingPaymentsResponse:
    return get_upcoming_payments(
        db,
        current_user.id,
        days=days,
        as_of=as_of,
    )
