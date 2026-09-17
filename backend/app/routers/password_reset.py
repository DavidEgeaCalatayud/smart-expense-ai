import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.core.http_security import log_security_event
from app.db.session import get_db
from app.routers.auth import _clear_session_cookie
from app.services.auth_rate_limit import consume_limit, require_ip_limit
from app.services.auth_service import normalize_email
from app.services.password_reset_service import InvalidResetTokenError, confirm_password_reset, send_password_recovery
from app.services.recovery_email import EmailDeliveryError, get_recovery_email_sender

router = APIRouter(prefix="/auth/password-reset", tags=["auth"])
NEUTRAL_MESSAGE = "If an account exists for that email, you will receive instructions to reset your password."


class ResetRequest(BaseModel):
    email: EmailStr


class ResetConfirm(BaseModel):
    token: str = Field(min_length=43, max_length=43, pattern=r"^[A-Za-z0-9_-]+$")
    newPassword: str = Field(min_length=12, max_length=128)


class ResetRequested(BaseModel):
    message: str = NEUTRAL_MESSAGE


@router.post("/request", response_model=ResetRequested, status_code=202)
def request_reset(payload: ResetRequest, request: Request, background_tasks: BackgroundTasks,
                  db: Session = Depends(get_db)) -> ResetRequested:
    try:
        sender = get_recovery_email_sender()
    except EmailDeliveryError:
        raise HTTPException(503, "Password recovery is temporarily unavailable. Please try again later.") from None
    require_ip_limit(db, request, "reset-request-ip", 10, 900)
    email = normalize_email(str(payload.email))
    # The same counters and reply apply to registered and unknown email addresses.
    allowed = consume_limit(db, "reset-email", email, 3, 3600)
    if allowed:
        background_tasks.add_task(send_password_recovery, email, sender)
    log_security_event(request, "password_reset_request", "accepted")
    return ResetRequested()


@router.post("/confirm", status_code=204)
def confirm_reset(payload: ResetConfirm, request: Request, response: Response,
                  db: Session = Depends(get_db)) -> None:
    require_ip_limit(db, request, "reset-confirm-ip", 20, 900)
    try:
        user_id = confirm_password_reset(db, payload.token, payload.newPassword)
    except InvalidResetTokenError as exc:
        log_security_event(request, "password_reset_confirm", "rejected", level=logging.WARNING)
        raise HTTPException(400, str(exc)) from None
    _clear_session_cookie(response)
    log_security_event(request, "password_reset_confirm", "success", user_id=user_id)
