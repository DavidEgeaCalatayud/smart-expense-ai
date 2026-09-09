from __future__ import annotations

import atexit
import json
import logging
import queue
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable
from urllib.request import Request as UrlRequest
from urllib.request import urlopen
from uuid import UUID

from app.core.config import settings


security_logger = logging.getLogger("smart_expense.security")
security_logger.setLevel(logging.INFO)
delivery_logger = logging.getLogger("smart_expense.security.delivery")

SECURITY_EVENT_SCHEMA = "security-event-v1"
Delivery = Callable[[dict[str, object]], None]


@dataclass(frozen=True)
class SecurityEvent:
    timestamp: str
    environment: str
    event: str
    outcome: str
    severity: str
    request_id: str
    alert: bool
    user_id: UUID | None = None

    def as_payload(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "schemaVersion": SECURITY_EVENT_SCHEMA,
            "timestamp": self.timestamp,
            "service": "smart-expense-api",
            "environment": self.environment,
            "event": self.event,
            "outcome": self.outcome,
            "severity": self.severity,
            "requestId": self.request_id,
            "alert": self.alert,
        }
        if self.user_id is not None:
            payload["userId"] = str(self.user_id)
        return payload


class SecurityMonitor:
    """Emit privacy-minimized security events locally and to an optional central webhook.

    Webhook delivery is deliberately fail-open and happens on a bounded background queue so
    an unavailable monitoring provider cannot block authentication or other API requests.
    """

    _STOP = object()

    def __init__(
        self,
        *,
        environment: str,
        webhook_url: str | None = None,
        bearer_token: str | None = None,
        timeout_seconds: float = 2.0,
        queue_size: int = 256,
        delivery: Delivery | None = None,
    ) -> None:
        self.environment = environment
        self.webhook_url = webhook_url
        self.bearer_token = bearer_token
        self.timeout_seconds = timeout_seconds
        self._queue: queue.Queue[dict[str, object] | object] = queue.Queue(maxsize=queue_size)
        self._delivery = delivery or self._deliver_webhook
        self._worker: threading.Thread | None = None
        self._closed = False

        if self.webhook_url is not None:
            self._worker = threading.Thread(
                target=self._run_worker,
                name="security-monitor-delivery",
                daemon=True,
            )
            self._worker.start()

    def emit(
        self,
        *,
        event: str,
        outcome: str,
        request_id: str,
        user_id: UUID | None = None,
        level: int = logging.INFO,
    ) -> None:
        event_record = SecurityEvent(
            timestamp=datetime.now(timezone.utc).isoformat(),
            environment=self.environment,
            event=event,
            outcome=outcome,
            severity=logging.getLevelName(level),
            request_id=request_id,
            alert=level >= logging.WARNING,
            user_id=user_id,
        )
        payload = event_record.as_payload()
        security_logger.log(
            level,
            json.dumps(payload, sort_keys=True, separators=(",", ":")),
        )

        if self.webhook_url is None or self._closed:
            return

        try:
            self._queue.put_nowait(payload)
        except queue.Full:
            self._log_delivery_event(
                "dropped",
                event=event,
                request_id=request_id,
                level=logging.ERROR,
            )

    def flush(self, timeout_seconds: float = 1.0) -> bool:
        deadline = time.monotonic() + timeout_seconds
        while self._queue.unfinished_tasks and time.monotonic() < deadline:
            time.sleep(0.01)
        return self._queue.unfinished_tasks == 0

    def close(self, timeout_seconds: float = 1.0) -> None:
        if self._closed:
            return
        self._closed = True
        if self._worker is None:
            return

        try:
            self._queue.put_nowait(self._STOP)
        except queue.Full:
            self.flush(timeout_seconds)
            try:
                self._queue.put_nowait(self._STOP)
            except queue.Full:
                return
        self._worker.join(timeout=timeout_seconds)

    def _run_worker(self) -> None:
        while True:
            payload = self._queue.get()
            try:
                if payload is self._STOP:
                    return
                assert isinstance(payload, dict)
                self._delivery(payload)
            except Exception:
                event = str(payload.get("event", "unknown")) if isinstance(payload, dict) else "unknown"
                request_id = (
                    str(payload.get("requestId", "unavailable"))
                    if isinstance(payload, dict)
                    else "unavailable"
                )
                self._log_delivery_event(
                    "failed",
                    event=event,
                    request_id=request_id,
                    level=logging.ERROR,
                )
            finally:
                self._queue.task_done()

    def _deliver_webhook(self, payload: dict[str, object]) -> None:
        if self.webhook_url is None:
            return

        headers = {
            "Content-Type": "application/json",
            "User-Agent": "smart-expense-ai-security-monitor/1",
        }
        if self.bearer_token:
            headers["Authorization"] = f"Bearer {self.bearer_token}"

        request = UrlRequest(
            self.webhook_url,
            data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urlopen(request, timeout=self.timeout_seconds) as response:
            status = getattr(response, "status", 200)
            if status < 200 or status >= 300:
                raise RuntimeError("security monitoring webhook returned a non-success status")

    @staticmethod
    def _log_delivery_event(
        outcome: str,
        *,
        event: str,
        request_id: str,
        level: int,
    ) -> None:
        payload = {
            "schemaVersion": SECURITY_EVENT_SCHEMA,
            "service": "smart-expense-api",
            "event": "security_monitor_delivery",
            "outcome": outcome,
            "sourceEvent": event,
            "requestId": request_id,
        }
        delivery_logger.log(
            level,
            json.dumps(payload, sort_keys=True, separators=(",", ":")),
        )


security_monitor = SecurityMonitor(
    environment=settings.app_env,
    webhook_url=settings.security_alert_webhook_url,
    bearer_token=settings.security_alert_bearer_token,
    timeout_seconds=settings.security_alert_timeout_seconds,
    queue_size=settings.security_alert_queue_size,
)
atexit.register(security_monitor.close)


def emit_security_event(
    *,
    event: str,
    outcome: str,
    request_id: str,
    user_id: UUID | None = None,
    level: int = logging.INFO,
) -> None:
    security_monitor.emit(
        event=event,
        outcome=outcome,
        request_id=request_id,
        user_id=user_id,
        level=level,
    )
