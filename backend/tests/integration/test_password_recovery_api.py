from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Barrier
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.core.config import settings
from app.core.security import verify_password
from app.db.session import SessionLocal, engine
from app.main import app
from app.models.mobile_auth import MobileSession
from app.models.password_reset import AuthRateLimit, PasswordResetToken
from app.models.user import User
from app.routers import password_reset as router
from app.services import password_reset_service as service

pytestmark = pytest.mark.integration
ROOT = "/api/v1/auth/password-reset"
EMAIL = "recovery@example.com"
OLD = "previous-password-1234"
NEW = "replacement-password-5678"


@pytest.fixture(autouse=True)
def clean():
    with engine.begin() as conn:
        conn.execute(delete(User))
        conn.execute(delete(AuthRateLimit))
    yield
    with engine.begin() as conn:
        conn.execute(delete(User))
        conn.execute(delete(AuthRateLimit))


@pytest.fixture
def mail(monkeypatch):
    messages = []
    class Sender:
        def send(self, message):
            messages.append(message)
    monkeypatch.setattr(router, "get_recovery_email_sender", lambda: Sender())
    monkeypatch.setattr(settings, "password_reset_public_url", "https://app.example.com/reset-password")
    return messages


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client


def register(client):
    response = client.post("/api/v1/auth/register", json={"email": EMAIL, "password": OLD, "displayName": "Recovery"})
    assert response.status_code == 201
    return response.json()["user"]


def request_link(client, mail, email=EMAIL):
    response = client.post(f"{ROOT}/request", json={"email": email})
    assert response.status_code == 202, response.text
    return parse_qs(urlsplit(mail[-1].reset_url).query)["token"][0]


def confirm(client, raw, password=NEW):
    return client.post(f"{ROOT}/confirm", json={"token": raw, "newPassword": password})


def test_reset_revokes_web_mobile_and_all_links_without_auto_login(client, mail):
    register(client)
    web_cookie = client.cookies.get(settings.auth_cookie_name)
    device = str(uuid4())
    mobile = client.post("/api/v2/auth/mobile/login", json={"email": EMAIL, "password": OLD, "deviceId": device}).json()
    first = request_link(client, mail)
    second = request_link(client, mail)
    assert first != second and len(first) == 43
    with SessionLocal() as db:
        records = db.scalars(select(PasswordResetToken)).all()
        assert len(records) == 2
        assert {item.token_hash for item in records} == {service.token_digest(first), service.token_digest(second)}
        assert all(19 * 60 < (item.expires_at - item.created_at).total_seconds() < 21 * 60 for item in records)
    result = confirm(client, first)
    assert result.status_code == 204, result.text
    assert client.get("/api/v1/auth/me").status_code == 401
    client.cookies.set(settings.auth_cookie_name, web_cookie)
    assert client.get("/api/v1/auth/me").status_code == 401
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {mobile['accessToken']}"}).status_code == 401
    assert client.post("/api/v2/auth/mobile/refresh", json={"refreshToken": mobile["refreshToken"], "deviceId": device}).status_code == 401
    assert confirm(client, first).status_code == 400
    assert confirm(client, second).status_code == 400
    with SessionLocal() as db:
        assert all(item.revoked_at is not None for item in db.scalars(select(MobileSession)))
        assert all(item.used_at is not None for item in db.scalars(select(PasswordResetToken)))
        assert db.scalar(select(User)).session_version == 2
    assert client.post("/api/v1/auth/login", json={"email": EMAIL, "password": OLD}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": EMAIL, "password": NEW}).status_code == 200


def test_unknown_inactive_and_known_accounts_have_identical_responses(client, mail):
    register(client)
    known = client.post(f"{ROOT}/request", json={"email": EMAIL.upper()})
    unknown = client.post(f"{ROOT}/request", json={"email": "unknown@example.com"})
    with SessionLocal() as db:
        user = db.scalar(select(User)); user.is_active = False; db.commit()
    inactive = client.post(f"{ROOT}/request", json={"email": EMAIL})
    assert known.status_code == unknown.status_code == inactive.status_code == 202
    assert known.json() == unknown.json() == inactive.json() == {"message": router.NEUTRAL_MESSAGE}
    assert len(mail) == 1
    for response in (known, unknown, inactive):
        assert "token" not in response.text and "set-cookie" not in response.headers
        assert response.headers["cache-control"] == "no-store"


def test_expired_invalid_and_inactive_links_fail_and_weak_password_does_not_consume(client, mail):
    register(client)
    raw = request_link(client, mail)
    assert confirm(client, raw, "short").status_code == 422
    assert confirm(client, "X" * 43).status_code == 400
    with SessionLocal() as db:
        token = db.scalar(select(PasswordResetToken)); assert token.used_at is None
        token.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1); db.commit()
    expired = confirm(client, raw)
    assert expired.status_code == 400
    raw = request_link(client, mail)
    with SessionLocal() as db:
        user = db.scalar(select(User)); user.is_active = False; db.commit()
    assert confirm(client, raw).status_code == 400


def test_account_password_change_cancels_existing_recovery_links(client, mail):
    register(client)
    raw = request_link(client, mail)
    assert client.put("/api/v1/auth/password", json={"currentPassword": OLD, "newPassword": NEW}).status_code == 204
    assert confirm(client, raw).status_code == 400


def test_email_throttle_is_neutral_and_ip_throttle_has_retry_after(client, mail):
    register(client)
    for _ in range(5):
        response = client.post(f"{ROOT}/request", json={"email": EMAIL})
        assert response.status_code == 202 and response.json()["message"] == router.NEUTRAL_MESSAGE
    assert len(mail) == 3
    for _ in range(5):
        assert client.post(f"{ROOT}/request", json={"email": "unknown@example.com"}).status_code == 202
    response = client.post(f"{ROOT}/request", json={"email": "different@example.com"}, headers={"X-Real-IP": "8.8.8.8", "X-Forwarded-For": "9.9.9.9"})
    assert response.status_code == 429 and response.headers["retry-after"] == "900"
    with SessionLocal() as db:
        assert all(EMAIL not in row.key_hash for row in db.scalars(select(AuthRateLimit)))


def test_confirm_is_rate_limited_even_for_invalid_links(client):
    for _ in range(20):
        assert confirm(client, "x" * 43).status_code == 400
    assert confirm(client, "x" * 43).status_code == 429


def test_delivery_failure_is_neutral_and_does_not_log_secrets(client, mail, monkeypatch, caplog):
    register(client)
    class BrokenSender:
        def send(self, message):
            raise RuntimeError(f"{message.recipient} {message.reset_url} secret-api-key")
    monkeypatch.setattr(router, "get_recovery_email_sender", lambda: BrokenSender())
    response = client.post(f"{ROOT}/request", json={"email": EMAIL})
    assert response.status_code == 202
    assert EMAIL not in caplog.text and "token=" not in caplog.text and "secret-api-key" not in caplog.text
    assert "password_reset_delivery outcome=failed" in caplog.text
    with SessionLocal() as db:
        assert db.scalar(select(PasswordResetToken)).used_at is not None


def test_unconfigured_provider_is_unavailable_for_every_email(client):
    for email in (EMAIL, "unknown@example.com"):
        assert client.post(f"{ROOT}/request", json={"email": email}).status_code == 503


@pytest.mark.parametrize("same_link", [True, False])
def test_concurrent_confirmations_only_one_wins(client, mail, same_link):
    register(client)
    first = request_link(client, mail)
    second = first if same_link else request_link(client, mail)
    barrier = Barrier(2)
    def attempt(raw):
        with SessionLocal() as db:
            barrier.wait(timeout=10)
            try:
                service.confirm_password_reset(db, raw, NEW)
                return "success"
            except service.InvalidResetTokenError:
                return "invalid"
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, [first, second]))
    assert sorted(results) == ["invalid", "success"]
    with SessionLocal() as db:
        assert db.scalar(select(User)).session_version == 2


def test_transaction_rolls_back_every_change_on_failure(client, mail, monkeypatch):
    register(client)
    raw = request_link(client, mail)
    original = service.invalidate_account_sessions
    def fail_after_updates(db, user, now):
        original(db, user, now)
        db.flush()
        raise RuntimeError("Injected transaction failure")
    monkeypatch.setattr(service, "invalidate_account_sessions", fail_after_updates)
    with SessionLocal() as db, pytest.raises(RuntimeError):
        service.confirm_password_reset(db, raw, NEW)
    with SessionLocal() as db:
        user = db.scalar(select(User))
        assert verify_password(OLD, user.password_hash) and user.session_version == 1
        assert db.scalar(select(PasswordResetToken)).used_at is None


def test_cross_origin_request_rejected_and_account_deletion_cascades(client, mail):
    register(client)
    raw = request_link(client, mail)
    assert client.post(f"{ROOT}/confirm", json={"token": raw, "newPassword": NEW}, headers={"Origin": "https://evil.example"}).status_code == 403
    assert client.request("DELETE", "/api/v1/auth/account", json={"password": OLD, "confirmation": "DELETE"}).status_code == 204
    assert confirm(client, raw).status_code == 400
    with SessionLocal() as db:
        assert db.scalar(select(PasswordResetToken)) is None
