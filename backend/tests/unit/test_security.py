from datetime import datetime, timedelta, timezone
from uuid import uuid4

import jwt

from app.core.config import settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_password_hashing_never_stores_plaintext() -> None:
    password = "correct-horse-battery-staple"
    password_hash = hash_password(password)

    assert password_hash != password
    assert verify_password(password, password_hash) is True
    assert verify_password("wrong-password", password_hash) is False


def test_access_token_round_trip_preserves_user_id_and_session_version() -> None:
    user_id = uuid4()
    session_version = 3

    token = create_access_token(user_id, session_version)

    assert decode_access_token(token) == (user_id, session_version)


def test_invalid_access_token_is_rejected() -> None:
    assert decode_access_token("not-a-valid-jwt") is None


def test_token_missing_required_security_claims_is_rejected() -> None:
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "sub": str(uuid4()),
            "iat": now,
            "exp": now + timedelta(minutes=5),
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )

    assert decode_access_token(token) is None


def test_token_with_wrong_audience_is_rejected() -> None:
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "sub": str(uuid4()),
            "ver": 1,
            "iat": now,
            "exp": now + timedelta(minutes=5),
            "iss": settings.jwt_issuer,
            "aud": "another-application",
            "jti": str(uuid4()),
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )

    assert decode_access_token(token) is None
