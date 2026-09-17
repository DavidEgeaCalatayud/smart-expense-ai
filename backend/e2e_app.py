"""Test-only email capture. Not imported by the production entry point.

No HTTP route exposes tokens. CI reads the private outbox from its own filesystem.
"""
import hashlib
import json
import os
from pathlib import Path

from app.core.config import settings
from app.main import app
from app.routers import password_reset

if settings.app_env != "test" or not os.environ.get("E2E_RECOVERY_OUTBOX"):
    raise RuntimeError("The recovery E2E server requires APP_ENV=test and a private outbox")

settings.password_reset_public_url = "http://localhost:5173/reset-password"


class TestEmailSender:
    def send(self, message):
        outbox = Path(os.environ["E2E_RECOVERY_OUTBOX"])
        outbox.mkdir(mode=0o700, parents=True, exist_ok=True)
        name = hashlib.sha256(message.recipient.encode()).hexdigest() + ".json"
        fd = os.open(outbox / name, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as target:
            json.dump({"recipient": message.recipient, "resetUrl": message.reset_url}, target)


password_reset.get_recovery_email_sender = TestEmailSender
