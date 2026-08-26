import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.core.config import settings
from app.core.http_security import log_security_event
from app.core.security import create_access_token
from app.db.session import get_db
from app.models.user import User
from app.schemas import (
    AuthResponse,
    ChangePasswordRequest,
    DeleteAccountRequest,
    LoginRequest,
    PrivacyExportResponse,
    RegisterRequest,
    UserResponse,
)
from app.services.account_service import (
    InvalidCurrentPasswordError,
    PasswordReuseError,
    build_privacy_export,
    change_password as change_account_password,
    delete_account as delete_user_account,
)
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
        value=create_access_token(user.id, user.session_version),
        max_age=settings.access_token_minutes * 60,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.auth_cookie_name,
        path="/",
        secure=settings.auth_cookie_secure,
        httponly=True,
        samesite="lax",
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
    _clear_session_cookie(response)
    log_security_event(request, "logout", "success")


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return to_user_response(current_user)


@router.put("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    try:
        change_account_password(db, current_user, payload.currentPassword, payload.newPassword)
    except InvalidCurrentPasswordError as exc:
        log_security_event(
            request,
            "password_change",
            "rejected",
            user_id=current_user.id,
            level=logging.WARNING,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Current password is incorrect",
        ) from exc
    except PasswordReuseError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from the current password",
        ) from exc

    _set_session_cookie(response, current_user)
    log_security_event(request, "password_change", "success", user_id=current_user.id)


@router.get("/privacy-export", response_model=PrivacyExportResponse)
def privacy_export(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PrivacyExportResponse:
    export = build_privacy_export(db, current_user)
    log_security_event(request, "privacy_export", "success", user_id=current_user.id)
    return export


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    payload: DeleteAccountRequest,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    user_id = current_user.id
    try:
        delete_user_account(db, current_user, payload.password)
    except InvalidCurrentPasswordError as exc:
        log_security_event(
            request,
            "account_deletion",
            "rejected",
            user_id=user_id,
            level=logging.WARNING,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Current password is incorrect",
        ) from exc

    _clear_session_cookie(response)
    log_security_event(request, "account_deletion", "success", user_id=user_id)
