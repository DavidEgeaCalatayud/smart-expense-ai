from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.core.api_errors import ApiError
from app.db.session import get_db
from app.import_schemas import (
    CsvCommitResponse,
    CsvDetectRequest,
    CsvDetectResponse,
    CsvImportRequest,
    CsvPreviewResponse,
    ImportBatchPage,
)
from app.models.user import User
from app.services.csv_import_service import (
    CsvImportConflictError,
    CsvImportError,
    commit_csv_import,
    detect_csv,
    list_import_batches,
    preview_csv_import,
)


router = APIRouter(prefix="/imports", tags=["imports-v2"])


def _raise_import_error(exc: CsvImportError) -> None:
    raise ApiError(
        status.HTTP_422_UNPROCESSABLE_ENTITY,
        "invalid_csv_import",
        str(exc),
        details=exc.details,
    ) from exc


@router.post("/csv/detect", response_model=CsvDetectResponse)
def detect_csv_columns(
    payload: CsvDetectRequest,
    current_user: User = Depends(get_current_user),
) -> CsvDetectResponse:
    del current_user
    try:
        return detect_csv(payload)
    except CsvImportError as exc:
        _raise_import_error(exc)


@router.post("/csv/preview", response_model=CsvPreviewResponse)
def preview_csv(
    payload: CsvImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CsvPreviewResponse:
    try:
        return preview_csv_import(db, current_user.id, payload)
    except CsvImportError as exc:
        _raise_import_error(exc)


@router.post(
    "/csv/commit",
    response_model=CsvCommitResponse,
    status_code=status.HTTP_201_CREATED,
)
def commit_csv(
    payload: CsvImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CsvCommitResponse:
    try:
        return commit_csv_import(db, current_user.id, payload)
    except CsvImportError as exc:
        _raise_import_error(exc)
    except CsvImportConflictError as exc:
        raise ApiError(
            status.HTTP_409_CONFLICT,
            "csv_import_conflict",
            str(exc),
        ) from exc


@router.get("/batches", response_model=ImportBatchPage)
def get_import_batches(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ImportBatchPage:
    return list_import_batches(db, current_user.id, limit=limit)
