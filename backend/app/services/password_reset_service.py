from datetime import datetime, timedelta, timezone
import hashlib
import logging
import secrets
from urllib.parse import urlencode
from uuid import UUID

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.mobile_auth import MobileSession
from app.models.password_reset import PasswordResetToken
from app.models.user import User
from app.services.auth_service import normalize_email
from app.services.recovery_email import RecoveryEmail, RecoveryEmailSender

logger = logging.getLogger("smart_expense.security")


class InvalidResetTokenError(ValueError):
    pass


def token_digest(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def invalidate_account_sessions(db: Session, user: User, now: datetime) -> None:
    """Caller holds the user lock and commits this with the password update."""
    user.session_version += 1
    db.execute(update(MobileSession).where(
        MobileSession.user_id == user.id, MobileSession.revoked_at.is_(None)
    ).values(revoked_at=now))
    # Refresh tokens are unusable as soon as their parent session is revoked.
    db.execute(update(PasswordResetToken).where(
        PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None)
    ).values(used_at=now))


def send_password_recovery(email: str, sender: RecoveryEmailSender) -> None:
    """Runs AFTER the neutral HTTP response, also for unknown/inactive accounts.

    No raw token is persisted. A worker interruption requires a new user request.
    """
    try:
        with SessionLocal() as db:
            now = datetime.now(timezone.utc)
            db.execute(delete(PasswordResetToken).where(PasswordResetToken.expires_at < now - timedelta(days=1)))
            db.commit()
            user = db.scalar(select(User).where(
                func.lower(User.email) == normalize_email(email), User.is_active.is_(True)
            ).with_for_update())
            if user is None:
                db.commit()
                return
            raw = secrets.token_urlsafe(32)
            token = PasswordResetToken(user_id=user.id, token_hash=token_digest(raw),
                expires_at=now + timedelta(minutes=settings.password_reset_ttl_minutes))
            db.add(token)
            db.commit()
            token_id = token.id
            message = RecoveryEmail(user.email,
                f"{settings.password_reset_public_url}?{urlencode({'token': raw})}",
                settings.password_reset_ttl_minutes)
        try:
            sender.send(message)
        except Exception:
            # Invalidate an undelivered link without disturbing earlier valid requests.
            with SessionLocal() as db:
                db.execute(update(PasswordResetToken).where(PasswordResetToken.id == token_id).values(used_at=datetime.now(timezone.utc)))
                db.commit()
            raise
    except Exception:
        logger.error("security_event=password_reset_delivery outcome=failed")


def confirm_password_reset(db: Session, raw: str, new_password: str) -> UUID:
    digest = token_digest(raw)
    try:
        # Lock the user BEFORE any token. Two different links for one account must
        # serialize too, otherwise each can win and invalidate the other's password.
        user_id = db.scalar(select(PasswordResetToken.user_id).where(PasswordResetToken.token_hash == digest))
        user = db.scalar(select(User).where(User.id == user_id).with_for_update().execution_options(populate_existing=True)) if user_id else None
        token = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == digest).with_for_update()) if user else None
        now = datetime.now(timezone.utc)
        if (user is None or not user.is_active or token is None
                or token.used_at is not None or token.expires_at <= now):
            raise InvalidResetTokenError("This reset link is invalid or expired. Request a new one.")
        user.password_hash = hash_password(new_password)
        invalidate_account_sessions(db, user, now)
        db.commit()
        return user.id
    except Exception:
        db.rollback()
        raise
