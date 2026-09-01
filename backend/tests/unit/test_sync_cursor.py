from uuid import uuid4

import pytest

from app.services.sync_cursor import SyncTokenError, decode_cursor, encode_cursor


_BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"


def _noncanonical_signature_alias(signature: str) -> str:
    # A 32-byte HMAC encodes to 43 unpadded Base64URL characters. The final character carries
    # four significant bits and two zero padding bits, so a permissive decoder can accept four
    # textual aliases for the exact same signature bytes. The token contract rejects those aliases.
    last_index = _BASE64URL_ALPHABET.index(signature[-1])
    assert last_index % 4 == 0
    return signature[:-1] + _BASE64URL_ALPHABET[last_index + 1]


def test_cursor_rejects_noncanonical_base64url_signature_alias() -> None:
    user_id = uuid4()
    token = encode_cursor(user_id, 42)
    payload, signature = token.split(".")
    tampered = f"{payload}.{_noncanonical_signature_alias(signature)}"

    with pytest.raises(SyncTokenError, match="canonical base64url"):
        decode_cursor(tampered, user_id)

    assert decode_cursor(token, user_id) == 42
