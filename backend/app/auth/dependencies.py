import logging

from fastapi import Cookie, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.http_security import log_security_event
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User


def get_current_user(
    request: Request,
    session_token: str | None = Cookie(default=None, alias=settings.auth_cookie_name),
    db: Session = Depends(get_db),
) -> User:
    if not session_token:
        log_security_event(
            request,
            "session_validation",
            "missing",
            level=logging.WARNING,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    user_id = decode_access_token(session_token)
    if user_id is None:
        log_security_event(
            request,
            "session_validation",
            "invalid",
            level=logging.WARNING,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        )

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        log_security_event(
            request,
            "session_validation",
            "inactive",
            user_id=user_id,
            level=logging.WARNING,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        )

    return user
