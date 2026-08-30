import logging

from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.http_security import log_security_event
from app.core.security import decode_access_token, decode_mobile_access_token
from app.db.session import get_db
from app.models.user import User
from app.services.mobile_auth_service import mobile_session_is_active


def _unauthorized(
    request: Request,
    outcome: str,
    *,
    user_id=None,
) -> None:
    log_security_event(
        request,
        "session_validation",
        outcome,
        user_id=user_id,
        level=logging.WARNING,
    )
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired session" if outcome != "missing" else "Authentication required",
    )


def _bearer_token(authorization: str) -> str | None:
    scheme, separator, token = authorization.partition(" ")
    if separator != " " or scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def get_current_user(
    request: Request,
    session_token: str | None = Cookie(default=None, alias=settings.auth_cookie_name),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if authorization is not None:
        bearer = _bearer_token(authorization)
        if bearer is None:
            _unauthorized(request, "invalid")

        mobile_claims = decode_mobile_access_token(bearer)
        if mobile_claims is None:
            _unauthorized(request, "invalid")

        user = db.get(User, mobile_claims.user_id)
        if user is None or not user.is_active:
            _unauthorized(request, "inactive", user_id=mobile_claims.user_id)
        if mobile_claims.session_version != user.session_version:
            _unauthorized(request, "revoked", user_id=mobile_claims.user_id)
        if not mobile_session_is_active(
            db,
            session_id=mobile_claims.session_id,
            user_id=user.id,
            session_version=mobile_claims.session_version,
        ):
            _unauthorized(request, "revoked", user_id=user.id)
        return user

    if not session_token:
        _unauthorized(request, "missing")

    decoded_session = decode_access_token(session_token)
    if decoded_session is None:
        _unauthorized(request, "invalid")

    user_id, token_session_version = decoded_session
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        _unauthorized(request, "inactive", user_id=user_id)

    if token_session_version != user.session_version:
        _unauthorized(request, "revoked", user_id=user_id)

    return user
