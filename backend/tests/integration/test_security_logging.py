import logging

from fastapi.testclient import TestClient

from app.main import app


def test_authentication_security_logs_exclude_credentials(caplog) -> None:
    email = "sensitive-log-check@example.com"
    password = "correct-horse-battery-staple"

    caplog.set_level(logging.INFO, logger="smart_expense.security")

    with TestClient(app) as client:
        response = client.post(
            "/api/auth/register",
            json={
                "email": email,
                "password": password,
                "displayName": "Log Safety Check",
            },
        )

    assert response.status_code in {201, 409}
    messages = "\n".join(caplog.messages)
    assert "security_event=registration" in messages
    assert email not in messages
    assert password not in messages
    assert "smart_expense_session" not in messages
