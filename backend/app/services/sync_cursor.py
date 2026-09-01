from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
from dataclasses import dataclass
from typing import Any, Literal
from uuid import UUID

from app.core.config import settings


class SyncTokenError(ValueError):
    pass


BootstrapPhase = Literal["category", "transaction", "budget"]


@dataclass(frozen=True)
class BootstrapPagePosition:
    high_water: int
    phase: BootstrapPhase
    after_id: UUID | None


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    try:
        decoded = base64.b64decode(value + padding, altchars=b"-_", validate=True)
    except (binascii.Error, ValueError, TypeError) as exc:
        raise SyncTokenError("Sync token is not valid base64url") from exc
    if _b64encode(decoded) != value:
        raise SyncTokenError("Sync token is not canonical base64url")
    return decoded


def _sign(message: bytes) -> bytes:
    key = hashlib.sha256(
        settings.jwt_secret.encode("utf-8") + b":smart-expense-ai:sync-v1"
    ).digest()
    return hmac.new(key, message, hashlib.sha256).digest()


def _seal(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return f"{_b64encode(raw)}.{_b64encode(_sign(raw))}"


def _open(token: str) -> dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 2:
        raise SyncTokenError("Sync token has an invalid structure")
    raw = _b64decode(parts[0])
    signature = _b64decode(parts[1])
    if not hmac.compare_digest(signature, _sign(raw)):
        raise SyncTokenError("Sync token signature is invalid")
    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise SyncTokenError("Sync token payload is invalid") from exc
    if not isinstance(payload, dict):
        raise SyncTokenError("Sync token payload must be an object")
    return payload


def encode_cursor(user_id: UUID, sequence: int) -> str:
    return _seal({"k": "cursor", "v": 1, "u": str(user_id), "s": sequence})


def decode_cursor(token: str, user_id: UUID) -> int:
    payload = _open(token)
    if payload.get("k") != "cursor" or payload.get("v") != 1:
        raise SyncTokenError("Unsupported sync cursor")
    if payload.get("u") != str(user_id):
        raise SyncTokenError("Sync cursor belongs to another account")
    sequence = payload.get("s")
    if not isinstance(sequence, int) or sequence < 0:
        raise SyncTokenError("Sync cursor sequence is invalid")
    return sequence


def encode_snapshot_token(user_id: UUID, high_water: int) -> str:
    return _seal({"k": "snapshot", "v": 1, "u": str(user_id), "h": high_water})


def decode_snapshot_token(token: str, user_id: UUID) -> int:
    payload = _open(token)
    if payload.get("k") != "snapshot" or payload.get("v") != 1:
        raise SyncTokenError("Unsupported bootstrap snapshot token")
    if payload.get("u") != str(user_id):
        raise SyncTokenError("Bootstrap snapshot belongs to another account")
    high_water = payload.get("h")
    if not isinstance(high_water, int) or high_water < 0:
        raise SyncTokenError("Bootstrap high-water mark is invalid")
    return high_water


def encode_page_token(
    user_id: UUID,
    high_water: int,
    phase: BootstrapPhase,
    after_id: UUID | None,
) -> str:
    return _seal(
        {
            "k": "page",
            "v": 1,
            "u": str(user_id),
            "h": high_water,
            "p": phase,
            "a": None if after_id is None else str(after_id),
        }
    )


def decode_page_token(
    token: str,
    user_id: UUID,
    expected_high_water: int,
) -> BootstrapPagePosition:
    payload = _open(token)
    if payload.get("k") != "page" or payload.get("v") != 1:
        raise SyncTokenError("Unsupported bootstrap page token")
    if payload.get("u") != str(user_id):
        raise SyncTokenError("Bootstrap page belongs to another account")
    if payload.get("h") != expected_high_water:
        raise SyncTokenError("Bootstrap page token does not match the snapshot")
    phase = payload.get("p")
    if phase not in {"category", "transaction", "budget"}:
        raise SyncTokenError("Bootstrap phase is invalid")
    raw_after = payload.get("a")
    try:
        after_id = None if raw_after is None else UUID(str(raw_after))
    except ValueError as exc:
        raise SyncTokenError("Bootstrap keyset position is invalid") from exc
    return BootstrapPagePosition(
        high_water=expected_high_water,
        phase=phase,
        after_id=after_id,
    )
