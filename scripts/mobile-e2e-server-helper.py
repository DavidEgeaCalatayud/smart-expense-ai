from __future__ import annotations

import argparse
import json
import time
import urllib.parse
import urllib.request
import uuid
from typing import Any

DEFAULT_BASE_URL = "http://127.0.0.1:8000/api/v2"


def request_json(
    url: str,
    *,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    token: str | None = None,
) -> dict[str, Any] | None:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=10) as response:
        raw = response.read()
        return None if not raw else json.loads(raw)


def login(base_url: str, email: str, password: str) -> str:
    response = request_json(
        f"{base_url}/auth/mobile/login",
        method="POST",
        payload={
            "email": email,
            "password": password,
            "deviceId": str(uuid.uuid4()),
        },
    )
    if not response or not isinstance(response.get("accessToken"), str):
        raise RuntimeError("Second mobile E2E session did not return an access token")
    return response["accessToken"]


def search_transactions(base_url: str, token: str, merchant: str) -> list[dict[str, Any]]:
    query = urllib.parse.urlencode({"search": merchant, "pageSize": 20})
    response = request_json(f"{base_url}/transactions?{query}", token=token)
    if not response or not isinstance(response.get("items"), list):
        raise RuntimeError("Transaction search returned an invalid response")
    return [item for item in response["items"] if item.get("merchant") == merchant]


def mutate_transaction(
    base_url: str,
    token: str,
    current_merchant: str,
    server_merchant: str,
) -> None:
    items = search_transactions(base_url, token, current_merchant)
    if len(items) != 1:
        raise RuntimeError(
            f"Expected exactly one server transaction named {current_merchant!r}; found {len(items)}"
        )
    item = items[0]
    payload = {
        "merchant": server_merchant,
        "description": item["description"],
        "category": item["category"],
        "amount": str(item["amount"]),
        "date": item["date"],
        "type": item["type"],
        "paymentMethod": item["paymentMethod"],
        "isRecurring": item["isRecurring"],
    }
    request_json(
        f"{base_url}/transactions/{item['id']}",
        method="PUT",
        payload=payload,
        token=token,
    )
    print(f"Server transaction advanced independently: {current_merchant} -> {server_merchant}")


def assert_absent(base_url: str, token: str, merchant: str) -> None:
    if search_transactions(base_url, token, merchant):
        raise RuntimeError(
            f"Server unexpectedly contains {merchant!r} before the forced WorkManager run"
        )


def wait_present(base_url: str, token: str, merchant: str, timeout_seconds: int) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if search_transactions(base_url, token, merchant):
            print(f"Background worker pushed {merchant}")
            return
        time.sleep(1)
    raise RuntimeError(
        f"Background worker did not push {merchant!r} within {timeout_seconds} seconds"
    )


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="Host-side controls for Android native E2E")
    result.add_argument("--base-url", default=DEFAULT_BASE_URL)
    result.add_argument("--email", required=True)
    result.add_argument("--password", required=True)
    subparsers = result.add_subparsers(dest="command", required=True)

    mutate = subparsers.add_parser("mutate")
    mutate.add_argument("--from-merchant", required=True)
    mutate.add_argument("--to-merchant", required=True)

    absent = subparsers.add_parser("assert-absent")
    absent.add_argument("--merchant", required=True)

    present = subparsers.add_parser("wait-present")
    present.add_argument("--merchant", required=True)
    present.add_argument("--timeout-seconds", type=int, default=60)
    return result


def main() -> None:
    args = parser().parse_args()
    base_url = args.base_url.rstrip("/")
    token = login(base_url, args.email, args.password)

    if args.command == "mutate":
        mutate_transaction(base_url, token, args.from_merchant, args.to_merchant)
    elif args.command == "assert-absent":
        assert_absent(base_url, token, args.merchant)
    elif args.command == "wait-present":
        wait_present(base_url, token, args.merchant, args.timeout_seconds)
    else:
        raise RuntimeError(f"Unsupported command: {args.command}")


if __name__ == "__main__":
    main()
