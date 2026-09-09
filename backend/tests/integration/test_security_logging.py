import json
import logging

import pytest
from fastapi.testclient import TestClient

from app.main import app


pytestmark = pytest.mark.integration


def test_authentication_security_logs_exclude_credentials(caplog) -> None:
    email = "sensitive-log-check@example.com"
    password = "correct-horse-battery-staple"

    caplog.set_level(logging.INFO, logger="smart_expense.security")

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "password": password,
                "displayName": "Log Safety Check",
            },
        )

    assert response.status_code in {201, 409}
    security_events = [
        json.loads(message)
        for message in caplog.messages
        if message.startswith("{")
    ]
    registration_events = [
        event for event in security_events if event.get("event") == "registration"
    ]
    assert registration_events
    event = registration_events[-1]
    assert event["schemaVersion"] == "security-event-v1"
    assert event["outcome"] in {"success", "rejected"}
    assert event["requestId"] == response.headers["X-Request-ID"]

    messages = "\n".join(caplog.messages)
    assert email not in messages
    assert password not in messages
    assert "smart_expense_session" not in messages
