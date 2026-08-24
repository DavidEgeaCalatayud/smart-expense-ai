from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.core.api_errors import ApiError
from app.db.session import get_db
from app.models.user import User
from app.routers.intelligence_contract import to_legacy_finding
from app.schemas import (
    FindingStatus,
    FindingStatusUpdate,
    FindingType,
    IntelligenceFindingResponse,
    IntelligenceScanResponse,
    IntelligenceSummary,
)
from app.services.intelligence_service import (
    get_intelligence_summary,
    list_findings,
    scan_financial_intelligence,
    update_finding_status,
)

router = APIRouter(prefix="/intelligence", tags=["intelligence"])


@router.post("/scan", response_model=IntelligenceScanResponse)
def scan(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> IntelligenceScanResponse:
    return scan_financial_intelligence(db, current_user.id)


@router.get("/summary", response_model=IntelligenceSummary)
def summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> IntelligenceSummary:
    return get_intelligence_summary(db, current_user.id)


@router.get("/findings", response_model=list[IntelligenceFindingResponse])
def findings(
    finding_status: FindingStatus | None = Query(None, alias="status"),
    finding_type: FindingType | None = Query(None, alias="type"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[IntelligenceFindingResponse]:
    return [
        to_legacy_finding(finding)
        for finding in list_findings(
            db,
            current_user.id,
            status=finding_status,
            finding_type=finding_type,
        )
    ]


@router.patch("/findings/{finding_id}", response_model=IntelligenceFindingResponse)
def update_finding(
    finding_id: str,
    payload: FindingStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> IntelligenceFindingResponse:
    finding = update_finding_status(db, current_user.id, finding_id, payload.status)
    if finding is None:
        raise ApiError(
            status.HTTP_404_NOT_FOUND,
            "intelligence_finding_not_found",
            "Intelligence finding not found",
        )
    return to_legacy_finding(finding)
