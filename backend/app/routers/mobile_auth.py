import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.models.mobile_auth import MobileSession
from app.models.user import User
from app.core.config import settings
from app.core.http_security import log_security_event
from app.core.security import create_mobile_access_token, decode_mobile_access_token
from app.db.session import get_db
from app.mobile_auth_schemas import (
    MobileSessionInfo,
    MobileLoginRequest,
    MobileLogoutRequest,
    MobileRefreshRequest,
    MobileRegisterRequest,
    MobileTokenResponse,
)
from app.schemas import RegisterRequest
from app.services.auth_service import (
    UserAlreadyExistsError,
    authenticate_user,
    register_user,
    to_user_response,
)
from app.services.mobile_auth_service import (
    InvalidMobileRefreshTokenError,
    MobileRefreshReplayError,
    issue_mobile_session,
    revoke_mobile_session_by_refresh_token,
    rotate_mobile_refresh_token,
)


router = APIRouter(prefix="/auth/mobile", tags=["mobile-auth"])


def _token_response(user, session, refresh_token: str) -> MobileTokenResponse:
    return MobileTokenResponse(
        user=to_user_response(user),
        accessToken=create_mobile_access_token(user.id, user.session_version, session.id),
        expiresIn=settings.mobile_access_token_minutes * 60,
        refreshToken=refresh_token,
    )


@router.post("/register", response_model=MobileTokenResponse, status_code=status.HTTP_201_CREATED)
def mobile_register(
    payload: MobileRegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> MobileTokenResponse:
    try:
        user = register_user(
            db,
            RegisterRequest(
                email=payload.email,
                password=payload.password,
                displayName=payload.displayName,
            ),
        )
    except UserAlreadyExistsError as exc:
        log_security_event(
            request,
            "mobile_registration",
            "rejected",
            level=logging.WARNING,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Unable to create account",
        ) from exc

    session, refresh_token = issue_mobile_session(db, user, payload.deviceId)
    log_security_event(request, "mobile_registration", "success", user_id=user.id)
    return _token_response(user, session, refresh_token)


@router.post("/login", response_model=MobileTokenResponse)
def mobile_login(
    payload: MobileLoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> MobileTokenResponse:
    user = authenticate_user(db, str(payload.email), payload.password)
    if user is None:
        log_security_event(
            request,
            "mobile_login",
            "rejected",
            level=logging.WARNING,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    session, refresh_token = issue_mobile_session(db, user, payload.deviceId)
    log_security_event(request, "mobile_login", "success", user_id=user.id)
    return _token_response(user, session, refresh_token)


@router.post("/refresh", response_model=MobileTokenResponse)
def mobile_refresh(
    payload: MobileRefreshRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> MobileTokenResponse:
    try:
        user, session, refresh_token = rotate_mobile_refresh_token(
            db,
            payload.refreshToken,
            payload.deviceId,
        )
    except MobileRefreshReplayError as exc:
        log_security_event(
            request,
            "mobile_refresh",
            "replay_rejected",
            level=logging.WARNING,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired mobile session",
        ) from exc
    except InvalidMobileRefreshTokenError as exc:
        log_security_event(
            request,
            "mobile_refresh",
            "rejected",
            level=logging.WARNING,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired mobile session",
        ) from exc

    log_security_event(request, "mobile_refresh", "success", user_id=user.id)
    return _token_response(user, session, refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def mobile_logout(
    payload: MobileLogoutRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> None:
    revoked = revoke_mobile_session_by_refresh_token(
        db,
        payload.refreshToken,
        payload.deviceId,
    )
    log_security_event(
        request,
        "mobile_logout",
        "success" if revoked else "already_invalid",
    )


@router.get("/sessions", response_model=list[MobileSessionInfo])
def mobile_sessions(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MobileSessionInfo]:
    # Authentication has already validated the bearer/cookie. Decode only to identify
    # the current mobile session; never return token hashes, tokens or device identifiers.
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    claims = decode_mobile_access_token(token.strip()) if scheme.lower() == "bearer" else None
    sessions = db.scalars(
        select(MobileSession)
        .where(
            MobileSession.user_id == current_user.id,
            MobileSession.session_version == current_user.session_version,
            MobileSession.revoked_at.is_(None),
            MobileSession.expires_at > datetime.now(timezone.utc),
        )
        .order_by(MobileSession.last_seen_at.desc(), MobileSession.id)
        .limit(100)
    ).all()
    return [
        MobileSessionInfo(
            id=session.id,
            current=claims is not None and claims.session_id == session.id,
            createdAt=session.created_at,
            lastSeenAt=session.last_seen_at,
            expiresAt=session.expires_at,
        )
        for session in sessions
    ]
