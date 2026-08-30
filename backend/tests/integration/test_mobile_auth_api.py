from collections.abc import Generator
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.db.session import engine
from app.main import app
from app.models.user import User


pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def clean_users() -> Generator[None, None, None]:
    with engine.begin() as connection:
        connection.execute(delete(User))
    yield
    with engine.begin() as connection:
        connection.execute(delete(User))


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client


def mobile_register(client: TestClient, *, device_id: str | None = None) -> dict[str, object]:
    response = client.post(
        "/api/v2/auth/mobile/register",
        json={
            "email": "mobile@example.com",
            "password": "correct-horse-battery-staple",
            "displayName": "Mobile User",
            "deviceId": device_id or str(uuid4()),
        },
    )
    assert response.status_code == 201, response.text
    assert "set-cookie" not in response.headers
    return response.json()


def bearer(token: object) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_mobile_register_bearer_can_access_existing_sync_contract(client: TestClient) -> None:
    tokens = mobile_register(client)
    assert tokens["tokenType"] == "Bearer"
    assert tokens["expiresIn"] == 15 * 60
    assert tokens["accessToken"]
    assert tokens["refreshToken"]

    me = client.get("/api/v1/auth/me", headers=bearer(tokens["accessToken"]))
    assert me.status_code == 200, me.text
    assert me.json()["email"] == "mobile@example.com"

    bootstrap = client.get(
        "/api/v2/sync/bootstrap",
        params={"limit": 20},
        headers=bearer(tokens["accessToken"]),
    )
    assert bootstrap.status_code == 200, bootstrap.text
    assert bootstrap.json()["protocolVersion"] == "sync-v1"


def test_refresh_rotates_token_and_replay_revokes_mobile_session(client: TestClient) -> None:
    device_id = str(uuid4())
    initial = mobile_register(client, device_id=device_id)

    refreshed = client.post(
        "/api/v2/auth/mobile/refresh",
        json={"refreshToken": initial["refreshToken"], "deviceId": device_id},
    )
    assert refreshed.status_code == 200, refreshed.text
    rotated = refreshed.json()
    assert rotated["refreshToken"] != initial["refreshToken"]
    assert rotated["accessToken"] != initial["accessToken"]

    replay = client.post(
        "/api/v2/auth/mobile/refresh",
        json={"refreshToken": initial["refreshToken"], "deviceId": device_id},
    )
    assert replay.status_code == 401

    revoked_access = client.get(
        "/api/v1/auth/me",
        headers=bearer(rotated["accessToken"]),
    )
    assert revoked_access.status_code == 401

    revoked_refresh = client.post(
        "/api/v2/auth/mobile/refresh",
        json={"refreshToken": rotated["refreshToken"], "deviceId": device_id},
    )
    assert revoked_refresh.status_code == 401


def test_mobile_logout_revokes_access_and_is_idempotent(client: TestClient) -> None:
    device_id = str(uuid4())
    tokens = mobile_register(client, device_id=device_id)
    logout_payload = {"refreshToken": tokens["refreshToken"], "deviceId": device_id}

    logout = client.post("/api/v2/auth/mobile/logout", json=logout_payload)
    assert logout.status_code == 204

    me = client.get("/api/v1/auth/me", headers=bearer(tokens["accessToken"]))
    assert me.status_code == 401

    repeated = client.post("/api/v2/auth/mobile/logout", json=logout_payload)
    assert repeated.status_code == 204


def test_second_login_on_same_device_revokes_previous_mobile_session(client: TestClient) -> None:
    device_id = str(uuid4())
    first = mobile_register(client, device_id=device_id)

    second_response = client.post(
        "/api/v2/auth/mobile/login",
        json={
            "email": "mobile@example.com",
            "password": "correct-horse-battery-staple",
            "deviceId": device_id,
        },
    )
    assert second_response.status_code == 200, second_response.text
    second = second_response.json()

    old_me = client.get("/api/v1/auth/me", headers=bearer(first["accessToken"]))
    assert old_me.status_code == 401

    new_me = client.get("/api/v1/auth/me", headers=bearer(second["accessToken"]))
    assert new_me.status_code == 200


def test_password_change_revokes_mobile_access_and_refresh_via_session_version(client: TestClient) -> None:
    device_id = str(uuid4())
    mobile = mobile_register(client, device_id=device_id)

    web_login = client.post(
        "/api/v1/auth/login",
        json={
            "email": "mobile@example.com",
            "password": "correct-horse-battery-staple",
        },
    )
    assert web_login.status_code == 200

    password_change = client.put(
        "/api/v1/auth/password",
        json={
            "currentPassword": "correct-horse-battery-staple",
            "newPassword": "new-correct-horse-battery-staple",
        },
    )
    assert password_change.status_code == 204

    old_access = client.get("/api/v1/auth/me", headers=bearer(mobile["accessToken"]))
    assert old_access.status_code == 401

    old_refresh = client.post(
        "/api/v2/auth/mobile/refresh",
        json={"refreshToken": mobile["refreshToken"], "deviceId": device_id},
    )
    assert old_refresh.status_code == 401


def test_web_and_mobile_jwt_audiences_are_not_interchangeable(client: TestClient) -> None:
    mobile = mobile_register(client)

    web_login = client.post(
        "/api/v1/auth/login",
        json={
            "email": "mobile@example.com",
            "password": "correct-horse-battery-staple",
        },
    )
    assert web_login.status_code == 200
    web_token = client.cookies.get("smart_expense_session")
    assert web_token is not None

    web_as_bearer = client.get("/api/v1/auth/me", headers=bearer(web_token))
    assert web_as_bearer.status_code == 401

    client.cookies.set("smart_expense_session", str(mobile["accessToken"]))
    mobile_as_web_cookie = client.get("/api/v1/auth/me")
    assert mobile_as_web_cookie.status_code == 401
