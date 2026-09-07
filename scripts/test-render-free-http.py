"""HTTP acceptance against the disposable local Docker fixture, never a remote account."""
import json
from pathlib import Path
import sys
import urllib.error
import urllib.request
from uuid import uuid4

BASE = "http://127.0.0.1:18080"
HOST = "finance-fixture.onrender.com"


def request(path, payload=None, token=None, method=None, extra=None):
    headers = {"Host": HOST, "Content-Type": "application/json", **(extra or {})}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE + path, data=None if payload is None else json.dumps(payload).encode(), headers=headers, method=method)
    try:
        response = urllib.request.urlopen(req, timeout=20)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        body = response.read().decode()
        return response.status, response.headers, body


mode, filename = sys.argv[1:]
if mode == "create":
    status, headers, body = request("/")
    assert status == 200 and "<html" in body.lower()
    assert "max-age" in headers["Strict-Transport-Security"]
    assert "default-src 'self'" in headers["Content-Security-Policy"]
    assert request("/account-deletion.html")[0] == 200
    assert request("/health")[0] == 200
    status, _, body = request("/api/v2/auth/mobile/register", {
        "email": "free-fixture@example.com", "password": "correct-horse-battery-staple",
        "displayName": "Free Fixture", "deviceId": str(uuid4()),
    })
    assert status == 201, f"Registration status: {status}"
    tokens = json.loads(body)
    status, _, body = request("/api/v2/transactions", {
        "merchant": "Restart fixture", "description": "CI only", "category": "Food",
        "amount": "12.34", "date": "2026-09-07", "type": "expense",
        "paymentMethod": "card", "isRecurring": False,
    }, tokens["accessToken"])
    assert status == 201, f"Transaction status: {status}"
    Path(filename).write_text(json.dumps({"token": tokens["accessToken"], "transaction": json.loads(body)["id"]}))
elif mode == "verify":
    session = json.loads(Path(filename).read_text())
    status, _, body = request("/api/v2/transactions", token=session["token"])
    assert status == 200, f"Persisted transaction status: {status}"
    rows = [row for row in json.loads(body)["items"] if row["id"] == session["transaction"]]
    assert len(rows) == 1 and rows[0]["amount"] == "12.34"
    status, headers, _ = request("/api/v1/auth/login", {"email": "free-fixture@example.com", "password": "correct-horse-battery-staple"})
    assert status == 200 and "Secure" in headers.get("Set-Cookie", "")
    assert "HttpOnly" in headers.get("Set-Cookie", "")
    status, _, _ = request("/api/v1/auth/login", {"email": "free-fixture@example.com", "password": "wrong-password"}, extra={"Origin": "https://unrelated.invalid"})
    assert status == 403
    statuses = [request("/api/v2/auth/mobile/login", {"email": "free-fixture@example.com", "password": "wrong-password", "deviceId": str(uuid4())})[0] for _ in range(6)]
    assert 429 in statuses, "Auth limit was not enforced"
else:
    raise SystemExit("Expected create or verify")
