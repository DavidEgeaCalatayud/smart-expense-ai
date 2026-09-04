from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.advanced_insight_schemas import AdvancedInsightsResponse
from app.auth.dependencies import get_current_user
from app.core.api_errors import ApiError
from app.db.session import get_db
from app.models.user import User
from app.services.advanced_insights_service import build_advanced_insights
from app.services.entitlement_service import build_entitlements


router = APIRouter(prefix="/insights", tags=["advanced-insights"])
MONTH_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])$"


def _require_advanced_insights(user: User) -> None:
    feature = build_entitlements(user).features.get("advancedInsights")
    if feature is None or not feature.enabled:
        raise ApiError(
            status.HTTP_403_FORBIDDEN,
            "premium_feature_required",
            "Advanced insights require an enabled Premium entitlement.",
        )


@router.get("/advanced", response_model=AdvancedInsightsResponse)
def get_advanced_insights(
    month: str = Query(..., pattern=MONTH_PATTERN),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AdvancedInsightsResponse:
    _require_advanced_insights(current_user)
    return build_advanced_insights(db, current_user.id, month)
