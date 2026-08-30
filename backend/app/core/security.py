from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import secrets
from uuid import UUID, uuid4

import jwt
from jwt import InvalidTokenError
from pwdlib import PasswordHash

from app.core.config import settings


password_hasher = PasswordHash.recommended()


@dataclass(frozen=True)
class MobileAccessClaims:
    user_id: UUID
    session_version: int
    session_id: UUID


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_hasher.verify(password, password_hash)


def _encode_access_token(
    user_id: UUID,
    session_version: int,
    *,
    audience: str,
    expires_minutes: int,
    extra_claims: dict[str, object] | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=expires_minutes)
    payload: dict[str, object] = {
        "sub": str(user_id),
        "ver": session_version,
        "exp": expires_at,
        "iat": now,
        "iss": settings.jwt_issuer,
        "aud": audience,
        "jti": str(uuid4()),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: UUID, session_version: int) -> str:
    return _encode_access_token(
        user_id,
        session_version,
        audience=settings.jwt_audience,
        expires_minutes=settings.access_token_minutes,
    )


def create_mobile_access_token(user_id: UUID, session_version: int, session_id: UUID) -> str:
    return _encode_access_token(
        user_id,
        session_version,
        audience=settings.mobile_jwt_audience,
        expires_minutes=settings.mobile_access_token_minutes,
        extra_claims={"sid": str(session_id), "token_use": "mobile_access"},
    )


def decode_access_token(token: str) -> tuple[UUID, int] | None:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
            options={"require": ["sub", "ver", "exp", "iat", "iss", "aud", "jti"]},
        )
        subject = payload.get("sub")
        session_version = payload.get("ver")
        if not isinstance(subject, str) or not isinstance(session_version, int) or session_version < 1:
            return None
        return UUID(subject), session_version
    except (InvalidTokenError, ValueError):
        return None


def decode_mobile_access_token(token: str) -> MobileAccessClaims | None:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            issuer=settings.jwt_issuer,
            audience=settings.mobile_jwt_audience,
            options={
                "require": [
                    "sub",
                    "ver",
                    "sid",
                    "token_use",
                    "exp",
                    "iat",
                    "iss",
                    "aud",
                    "jti",
                ]
            },
        )
        subject = payload.get("sub")
        session_version = payload.get("ver")
        session_id = payload.get("sid")
        token_use = payload.get("token_use")
        if (
            not isinstance(subject, str)
            or not isinstance(session_version, int)
            or session_version < 1
            or not isinstance(session_id, str)
            or token_use != "mobile_access"
        ):
            return None
        return MobileAccessClaims(
            user_id=UUID(subject),
            session_version=session_version,
            session_id=UUID(session_id),
        )
    except (InvalidTokenError, ValueError):
        return None


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
