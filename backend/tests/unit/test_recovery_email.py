import json

import httpx
import pytest

from app.core.config import Settings
from app.services.recovery_email import ApiEmailSender, EmailDeliveryError, RecoveryEmail


@pytest.mark.parametrize("provider", ["brevo", "resend"])
def test_provider_adapter_sends_only_recovery_link(monkeypatch, provider):
    requests = []
    def handle(request):
        requests.append(request)
        return httpx.Response(201, json={"id": "sent"})
    client = httpx.Client(transport=httpx.MockTransport(handle))
    monkeypatch.setattr(httpx, "Client", lambda **kwargs: client)
    sender = ApiEmailSender(provider, "secret-key", "sender@example.com", "Smart Expense AI")
    sender.send(RecoveryEmail("user@example.com", "https://app.example.com/reset-password?token=opaque", 20))
    request = requests[0]
    payload = json.loads(request.content)
    if provider == "brevo":
        assert str(request.url) == "https://api.brevo.com/v3/smtp/email"
        assert request.headers["api-key"] == "secret-key"
        assert payload["to"] == [{"email": "user@example.com"}]
        assert "token=opaque" in payload["textContent"]
    else:
        assert str(request.url) == "https://api.resend.com/emails"
        assert request.headers["authorization"] == "Bearer secret-key"
        assert payload["to"] == ["user@example.com"]
        assert "token=opaque" in payload["text"]


def test_provider_errors_are_sanitized(monkeypatch):
    client = httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(500, text="secret-provider-details")))
    monkeypatch.setattr(httpx, "Client", lambda **kwargs: client)
    with pytest.raises(EmailDeliveryError, match="Recovery email delivery failed") as caught:
        ApiEmailSender("resend", "secret", "sender@example.com", "App").send(RecoveryEmail("user@example.com", "https://app.example.com/reset-password?token=secret", 20))
    assert "secret" not in str(caught.value)


@pytest.mark.parametrize("url", ["https://evil.example/?token=a", "http://example.com/reset-password", "https://user:secret@app.example.com/reset-password", "https://app.example.com/reset-password#fragment"])
def test_recovery_url_must_be_fixed_https_origin(url):
    with pytest.raises(ValueError):
        Settings(database_url="postgresql://test/test", jwt_secret="x" * 32, password_reset_public_url=url, _env_file=None)


def test_enabled_email_requires_complete_configuration():
    with pytest.raises(ValueError):
        Settings(database_url="postgresql://test/test", jwt_secret="x" * 32, email_provider="brevo", _env_file=None)
