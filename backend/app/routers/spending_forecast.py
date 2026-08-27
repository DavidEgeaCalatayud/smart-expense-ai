from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services.spending_forecast import get_spending_forecast
from app.spending_forecast_schemas import SpendingForecastResponse


router = APIRouter(
    prefix="/analytics/spending-forecast",
    tags=["spending-forecast-v2"],
)


@router.get("", response_model=SpendingForecastResponse)
def spending_forecast(
    as_of: date | None = Query(None, alias="asOf"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SpendingForecastResponse:
    return get_spending_forecast(db, current_user.id, as_of=as_of)
