from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import generate_refresh_token, hash_refresh_token
from app.models.mobile_auth import MobileRefreshToken, MobileSession
from app.models.user import User


class InvalidMobileRefreshTokenError(ValueError):
    pass


class MobileRefreshReplayError(InvalidMobileRefreshTokenError):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _revoke_session(db: Session, session: MobileSession, now: datetime) -> None:
    if session.revoked_at is None:
        session.revoked_at = now
    db.execute(
        update(MobileRefreshToken)
        .where(
            MobileRefreshToken.session_id == session.id,
            MobileRefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )


def issue_mobile_session(
    db: Session,
    user: User,
    device_id: UUID,
) -> tuple[MobileSession, str]:
    now = _now()
    expires_at = now + timedelta(days=settings.mobile_refresh_token_days)

    existing_sessions = db.scalars(
        select(MobileSession).where(
            MobileSession.user_id == user.id,
            MobileSession.device_id == device_id,
            MobileSession.revoked_at.is_(None),
        )
    ).all()
    for existing in existing_sessions:
        _revoke_session(db, existing, now)

    session = MobileSession(
        user_id=user.id,
        device_id=device_id,
        session_version=user.session_version,
        expires_at=expires_at,
    )
    db.add(session)
    db.flush()

    refresh_token = generate_refresh_token()
    db.add(
        MobileRefreshToken(
            session_id=session.id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=expires_at,
        )
    )
    db.commit()
    db.refresh(session)
    return session, refresh_token


def rotate_mobile_refresh_token(
    db: Session,
    raw_refresh_token: str,
    device_id: UUID,
) -> tuple[User, MobileSession, str]:
    now = _now()
    token_hash = hash_refresh_token(raw_refresh_token)
    token = db.scalar(
        select(MobileRefreshToken)
        .where(MobileRefreshToken.token_hash == token_hash)
        .with_for_update()
    )
    if token is None:
        raise InvalidMobileRefreshTokenError("Invalid mobile refresh token")

    session = db.scalar(
        select(MobileSession).where(MobileSession.id == token.session_id).with_for_update()
    )
    if session is None:
        raise InvalidMobileRefreshTokenError("Invalid mobile refresh token")

    if token.used_at is not None or token.replaced_by_id is not None:
        _revoke_session(db, session, now)
        db.commit()
        raise MobileRefreshReplayError("Mobile refresh token replay detected")

    if token.revoked_at is not None:
        raise InvalidMobileRefreshTokenError("Invalid mobile refresh token")

    user = db.get(User, session.user_id)
    invalid_session = (
        session.device_id != device_id
        or session.revoked_at is not None
        or session.expires_at <= now
        or token.expires_at <= now
        or user is None
        or not user.is_active
        or user.session_version != session.session_version
    )
    if invalid_session:
        _revoke_session(db, session, now)
        db.commit()
        raise InvalidMobileRefreshTokenError("Invalid mobile refresh token")

    replacement_raw = generate_refresh_token()
    replacement = MobileRefreshToken(
        session_id=session.id,
        token_hash=hash_refresh_token(replacement_raw),
        expires_at=session.expires_at,
    )
    db.add(replacement)
    db.flush()

    token.used_at = now
    token.replaced_by_id = replacement.id
    session.last_seen_at = now
    db.commit()
    db.refresh(session)
    return user, session, replacement_raw


def revoke_mobile_session_by_refresh_token(
    db: Session,
    raw_refresh_token: str,
    device_id: UUID,
) -> bool:
    token = db.scalar(
        select(MobileRefreshToken).where(
            MobileRefreshToken.token_hash == hash_refresh_token(raw_refresh_token)
        )
    )
    if token is None:
        return False

    session = db.get(MobileSession, token.session_id)
    if session is None or session.device_id != device_id:
        return False

    _revoke_session(db, session, _now())
    db.commit()
    return True


def mobile_session_is_active(
    db: Session,
    *,
    session_id: UUID,
    user_id: UUID,
    session_version: int,
) -> bool:
    session = db.get(MobileSession, session_id)
    if session is None:
        return False
    now = _now()
    return (
        session.user_id == user_id
        and session.session_version == session_version
        and session.revoked_at is None
        and session.expires_at > now
    )
