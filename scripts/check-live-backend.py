"""Read-only HTTPS ingress smoke test. Never logs response bodies or sends account data."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit


def validate_origin(value):
    parsed = urlsplit(value)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or parsed.query or parsed.fragment or parsed.path not in ("", "/")):
        raise ValueError("Backend must be an HTTPS origin without credentials, path, query or fragment")
    return value.rstrip("/")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


def inspect_response(path, status, headers, body):
    expected = 401 if path.startswith("/api/") else 200
    if status != expected:
        raise ValueError(f"{path}: expected HTTP {expected}, received {status}")
    headers = {key.lower(): value for key, value in headers.items()}
    if "max-age=" not in headers.get("strict-transport-security", "").lower():
        raise ValueError(f"{path}: HSTS is missing")
    if headers.get("x-content-type-options", "").lower() != "nosniff":
        raise ValueError(f"{path}: nosniff is missing")
    if path == "/health" and json.loads(body).get("status") != "ok":
        raise ValueError("Backend health did not report ok")
    if path.startswith("/api/"):
        if "application/json" not in headers.get("content-type", ""):
            raise ValueError(f"{path}: API returned an unexpected content type")
        if json.loads(body).get("error", {}).get("code") != "http_401":
            raise ValueError(f"{path}: authentication contract is missing")
    if path in ("/", "/account-deletion.html"):
        if b"<html" not in body.lower() or "default-src" not in headers.get("content-security-policy", ""):
            raise ValueError(f"{path}: web document or CSP is missing")
    return {"path": path, "httpStatus": status, "result": "passed"}


def check(origin):
    origin = validate_origin(origin)
    opener = urllib.request.build_opener(NoRedirect)
    evidence = []
    for path in ("/health", "/", "/account-deletion.html", "/api/v2/financial-accounts",
                 "/api/v2/net-worth/summary", "/api/v2/net-worth/history"):
        for attempt in range(2):
            try:
                try:
                    response = opener.open(origin + path, timeout=60)
                except urllib.error.HTTPError as error:
                    response = error
                with response:
                    if response.status in (502, 503, 504) and attempt == 0:
                        time.sleep(2)
                        continue
                    evidence.append(inspect_response(path, response.status, dict(response.headers), response.read(200000)))
                break
            except (TimeoutError, urllib.error.URLError):
                if attempt:
                    raise RuntimeError(f"{path}: HTTPS request failed") from None
                time.sleep(2)
    return {"contract": "live-backend-smoke-v1", "apiBaseUrl": origin,
            "checkedAt": datetime.now(timezone.utc).isoformat(), "checks": evidence,
            "scope": "Unauthenticated ingress only; not database, email delivery or physical-device acceptance"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = check(args.base_url)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
