"""Synthetic native recovery fixture; stdout contains a token only for shell capture."""
import hashlib
import json
import os
from pathlib import Path
import sys
import time
from urllib.parse import parse_qs, urlsplit

import httpx

if os.environ.get("APP_ENV") != "test":
    raise SystemExit("Recovery fixtures require APP_ENV=test")
email = "native-recovery-e2e@example.com"
old = "native-recovery-old-123"
new = "native-recovery-new-456"
base = "http://localhost:8000/api/v1/auth"
action = sys.argv[1]
with httpx.Client() as client:
    if action == "register":
        response = client.post(base + "/register", json={"email": email, "password": old, "displayName": "Recovery E2E"})
        response.raise_for_status()
    elif action == "token":
        path = Path(os.environ["E2E_RECOVERY_OUTBOX"]) / (hashlib.sha256(email.encode()).hexdigest() + ".json")
        for _ in range(100):
            if path.exists():
                break
            time.sleep(0.1)
        payload = json.loads(path.read_text())
        print(parse_qs(urlsplit(payload["resetUrl"]).query)["token"][0])
    elif action == "verify":
        assert client.post(base + "/login", json={"email": email, "password": old}).status_code == 401
        assert client.post(base + "/login", json={"email": email, "password": new}).status_code == 200
    else:
        raise SystemExit("Unknown recovery fixture action")
