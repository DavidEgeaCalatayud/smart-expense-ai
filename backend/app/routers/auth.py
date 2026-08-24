import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.core.config import settings
from app.core.http_security import log_security_event
from app.core.security import create_access_token
from app.db.session import get_db
from app.models.user import User
from app.schemas import AuthResponse, LoginRequest, RegisterRequest, UserResponse
from app.services.auth_service import (
    UserAlreadyExistsError,
    authenticate_user,
    register_user,
    to_user_response,
)


router = APIRouter(prefix="/auth", tags=["auth"])


def _set_session_cookie(response: Response, user: User) -> None:
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=create_access_token(user.id),
        max_age=settings.access_token_minutes * 60,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/",
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthResponse:
    try:
        user = register_user(db, payload)
    except UserAlreadyExistsError as exc:
        log_security_event(
            request,
            "registration",
            "rejected",
            level=logging.WARNING,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Unable to create account",
        ) from exc

    _set_session_cookie(response, user)
    log_security_event(request, "registration", "success", user_id=user.id)
    return AuthResponse(user=to_user_response(user))


@router.post("/login", response_model=AuthResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthResponse:
    user = authenticate_user(db, str(payload.email), payload.password)
    if user is None:
        log_security_event(
            request,
            "login",
            "rejected",
            level=logging.WARNING,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    _set_session_cookie(response, user)
    log_security_event(request, "login", "success", user_id=user.id)
    return AuthResponse(user=to_user_response(user))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response) -> None:
    response.delete_cookie(
        key=settings.auth_cookie_name,
        path="/",
        secure=settings.auth_cookie_secure,
        httponly=True,
        samesite="lax",
    )
    log_security_event(request, "logout", "success")


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return to_user_response(current_user)
