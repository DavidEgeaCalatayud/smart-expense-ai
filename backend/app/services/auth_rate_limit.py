from datetime import datetime, timezone
import hashlib
import hmac
from ipaddress import ip_address

from fastapi import HTTPException, Request
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.password_reset import AuthRateLimit


def client_address(request: Request) -> str:
    peer = request.client.host if request.client else "unknown"
    if peer in {value.strip() for value in settings.auth_trusted_proxy_ips.split(",")}:
        try:
            return str(ip_address(request.headers.get("x-real-ip", peer)))
        except ValueError:
            pass
    return peer


def consume_limit(db: Session, scope: str, value: str, limit: int, seconds: int) -> bool:
    now = datetime.now(timezone.utc)
    window = int(now.timestamp()) // seconds
    key = hmac.new(settings.jwt_secret.encode(), f"{scope}:{window}:{value}".encode(), hashlib.sha256).hexdigest()
    expires_at = datetime.fromtimestamp((window + 1) * seconds, timezone.utc)
    db.execute(delete(AuthRateLimit).where(AuthRateLimit.expires_at <= now))
    statement = insert(AuthRateLimit).values(key_hash=key, attempts=1, expires_at=expires_at)
    count = db.scalar(statement.on_conflict_do_update(
        index_elements=[AuthRateLimit.key_hash],
        set_={"attempts": AuthRateLimit.attempts + 1},
    ).returning(AuthRateLimit.attempts))
    db.commit()
    return count is not None and count <= limit


def require_ip_limit(db: Session, request: Request, scope: str, limit: int, seconds: int) -> None:
    if not consume_limit(db, scope, client_address(request), limit, seconds):
        raise HTTPException(429, "Too many attempts. Please try again later.", headers={"Retry-After": str(seconds)})
