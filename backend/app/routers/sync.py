from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.core.api_errors import ApiError
from app.db.session import get_db
from app.models.user import User
from app.services.sync_cursor import SyncTokenError
from app.services.sync_service import bootstrap_sync, pull_sync, push_sync
from app.sync_schemas import SyncBootstrapPage, SyncPullPage, SyncPushRequest, SyncPushResponse


router = APIRouter(prefix="/sync", tags=["sync-v1"])


@router.post("/push", response_model=SyncPushResponse)
def push_changes(
    payload: SyncPushRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SyncPushResponse:
    return push_sync(db, current_user.id, payload)


@router.get("/pull", response_model=SyncPullPage)
def pull_changes(
    cursor: str = Query(..., min_length=16, max_length=2048),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SyncPullPage:
    try:
        return pull_sync(db, current_user.id, cursor, limit=limit)
    except SyncTokenError as exc:
        raise ApiError(
            status.HTTP_400_BAD_REQUEST,
            "invalid_sync_cursor",
            str(exc),
        ) from exc


@router.get("/bootstrap", response_model=SyncBootstrapPage)
def bootstrap(
    limit: int = Query(100, ge=1, le=500),
    snapshot_token: str | None = Query(None, alias="snapshotToken", max_length=2048),
    page_token: str | None = Query(None, alias="pageToken", max_length=2048),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SyncBootstrapPage:
    try:
        return bootstrap_sync(
            db,
            current_user.id,
            limit=limit,
            snapshot_token=snapshot_token,
            page_token=page_token,
        )
    except (SyncTokenError, ValueError) as exc:
        raise ApiError(
            status.HTTP_400_BAD_REQUEST,
            "invalid_sync_snapshot",
            str(exc),
        ) from exc
