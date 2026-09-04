import json
import logging
from uuid import uuid4

from app.core.security_monitoring import SecurityMonitor


def test_security_monitor_emits_structured_event_and_central_copy(caplog) -> None:
    delivered: list[dict[str, object]] = []
    monitor = SecurityMonitor(
        environment="test",
        webhook_url="https://security.example.test/events",
        delivery=delivered.append,
    )
    user_id = uuid4()

    with caplog.at_level(logging.INFO, logger="smart_expense.security"):
        monitor.emit(
            event="login",
            outcome="rejected",
            request_id="req-123",
            user_id=user_id,
            level=logging.WARNING,
        )

    assert monitor.flush()
    monitor.close()

    log_payload = json.loads(caplog.records[-1].message)
    assert log_payload == delivered[0]
    assert log_payload["schemaVersion"] == "security-event-v1"
    assert log_payload["service"] == "smart-expense-api"
    assert log_payload["environment"] == "test"
    assert log_payload["event"] == "login"
    assert log_payload["outcome"] == "rejected"
    assert log_payload["severity"] == "WARNING"
    assert log_payload["requestId"] == "req-123"
    assert log_payload["alert"] is True
    assert log_payload["userId"] == str(user_id)
    assert "email" not in log_payload
    assert "token" not in log_payload


def test_information_event_is_centralized_without_becoming_alert() -> None:
    delivered: list[dict[str, object]] = []
    monitor = SecurityMonitor(
        environment="test",
        webhook_url="https://security.example.test/events",
        delivery=delivered.append,
    )

    monitor.emit(
        event="logout",
        outcome="success",
        request_id="req-info",
        level=logging.INFO,
    )

    assert monitor.flush()
    monitor.close()
    assert delivered[0]["alert"] is False
    assert delivered[0]["severity"] == "INFO"


def test_delivery_failure_is_fail_open_and_privacy_minimized(caplog) -> None:
    def failing_delivery(_: dict[str, object]) -> None:
        raise RuntimeError("provider secret detail must never be logged")

    monitor = SecurityMonitor(
        environment="test",
        webhook_url="https://security.example.test/events",
        bearer_token="super-secret-token",
        delivery=failing_delivery,
    )

    with caplog.at_level(logging.ERROR, logger="smart_expense.security.delivery"):
        monitor.emit(
            event="mobile_refresh",
            outcome="replay_rejected",
            request_id="req-fail",
            level=logging.WARNING,
        )
        assert monitor.flush()

    monitor.close()
    delivery_payload = json.loads(caplog.records[-1].message)
    assert delivery_payload["event"] == "security_monitor_delivery"
    assert delivery_payload["outcome"] == "failed"
    assert delivery_payload["sourceEvent"] == "mobile_refresh"
    assert delivery_payload["requestId"] == "req-fail"
    assert "super-secret-token" not in caplog.text
    assert "provider secret detail" not in caplog.text
