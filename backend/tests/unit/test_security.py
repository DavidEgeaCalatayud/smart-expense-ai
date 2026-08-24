from uuid import uuid4

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


def test_access_token_round_trip_preserves_user_id() -> None:
    user_id = uuid4()

    token = create_access_token(user_id)

    assert decode_access_token(token) == user_id


def test_invalid_access_token_is_rejected() -> None:
    assert decode_access_token("not-a-valid-jwt") is None
