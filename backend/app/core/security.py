from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import jwt
from jwt import InvalidTokenError
from pwdlib import PasswordHash

from app.core.config import settings


password_hasher = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_hasher.verify(password, password_hash)


def create_access_token(user_id: UUID, session_version: int) -> str:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=settings.access_token_minutes)
    return jwt.encode(
        {
            "sub": str(user_id),
            "ver": session_version,
            "exp": expires_at,
            "iat": now,
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
            "jti": str(uuid4()),
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
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
