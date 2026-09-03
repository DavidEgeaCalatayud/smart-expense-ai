from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.core.api_errors import ApiError
from app.db.session import get_db
from app.models.user import User
from app.report_schemas import MonthlyReportResponse
from app.services.entitlement_service import build_entitlements
from app.services.report_service import build_monthly_report, render_monthly_report_csv


router = APIRouter(prefix="/reports", tags=["reports"])
MONTH_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])$"


def _require_exportable_reports(user: User) -> None:
    feature = build_entitlements(user).features.get("exportableReports")
    if feature is None or not feature.enabled:
        raise ApiError(
            status.HTTP_403_FORBIDDEN,
            "premium_feature_required",
            "Exportable reports require an enabled Premium entitlement.",
        )


@router.get("/monthly", response_model=MonthlyReportResponse)
def get_monthly_report(
    month: str = Query(..., pattern=MONTH_PATTERN),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MonthlyReportResponse:
    _require_exportable_reports(current_user)
    return build_monthly_report(db, current_user.id, month).summary


@router.get("/monthly.csv")
def download_monthly_report(
    month: str = Query(..., pattern=MONTH_PATTERN),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    _require_exportable_reports(current_user)
    report = build_monthly_report(db, current_user.id, month)
    return Response(
        content=render_monthly_report_csv(report),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{report.summary.downloadFilename}"',
            "Cache-Control": "private, no-store",
        },
    )
