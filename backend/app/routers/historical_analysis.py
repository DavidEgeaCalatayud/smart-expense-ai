from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.core.api_errors import ApiError
from app.db.session import get_db
from app.historical_contract import HistoricalAnalysisResponseV21
from app.models.user import User
from app.services.historical_analysis_v2_1 import (
    get_latest_historical_analysis,
    run_historical_analysis,
)


router = APIRouter(prefix="/intelligence/historical-analysis", tags=["historical-analysis-v2"])


@router.post("", response_model=HistoricalAnalysisResponseV21)
def analyze_history(
    months: int = Query(12, ge=6, le=24),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> HistoricalAnalysisResponseV21:
    return run_historical_analysis(db, current_user.id, window_months=months)


@router.get("/latest", response_model=HistoricalAnalysisResponseV21)
def latest_analysis(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> HistoricalAnalysisResponseV21:
    result = get_latest_historical_analysis(db, current_user.id)
    if result is None:
        raise ApiError(
            status.HTTP_404_NOT_FOUND,
            "historical_analysis_not_found",
            "No historical analysis has been generated yet",
        )
    return result
