"""Provider boundary: never log the payload, recipient, API key or reset URL."""
from dataclasses import dataclass
from html import escape
from typing import Protocol

import httpx

from app.core.config import settings


@dataclass(frozen=True)
class RecoveryEmail:
    recipient: str
    reset_url: str
    expires_minutes: int


class EmailDeliveryError(RuntimeError):
    pass


class RecoveryEmailSender(Protocol):
    def send(self, message: RecoveryEmail) -> None: ...


class ApiEmailSender:
    def __init__(self, provider: str, api_key: str, sender_email: str, sender_name: str):
        self.provider = provider
        self.api_key = api_key
        self.sender_email = sender_email
        self.sender_name = sender_name

    def send(self, message: RecoveryEmail) -> None:
        subject = "Reset your Smart Expense AI password"
        text = (
            "We received a request to reset your Smart Expense AI password.\n\n"
            f"Choose a new password: {message.reset_url}\n\n"
            f"This link can be used once and expires in {message.expires_minutes} minutes. "
            "Changing your password will sign you out on all devices. "
            "If you did not request this, ignore this email; your password is unchanged."
        )
        html = (
            "<p>We received a request to reset your Smart Expense AI password.</p>"
            f'<p><a href="{escape(message.reset_url, quote=True)}">Reset password</a></p>'
            f"<p>This link expires in {message.expires_minutes} minutes and can be used once.</p>"
            "<p>Changing your password will sign you out on all devices.</p>"
            "<p>If you did not request this, ignore this email; your password is unchanged.</p>"
        )
        if self.provider == "brevo":
            url = "https://api.brevo.com/v3/smtp/email"
            headers = {"api-key": self.api_key}
            body = {"sender": {"email": self.sender_email, "name": self.sender_name},
                    "to": [{"email": message.recipient}], "subject": subject,
                    "htmlContent": html, "textContent": text}
        else:
            url = "https://api.resend.com/emails"
            headers = {"Authorization": f"Bearer {self.api_key}"}
            body = {"from": f"{self.sender_name} <{self.sender_email}>",
                    "to": [message.recipient], "subject": subject, "html": html, "text": text}
        try:
            with httpx.Client(timeout=10, follow_redirects=False) as client:
                response = client.post(url, headers=headers, json=body)
                response.raise_for_status()
        except httpx.HTTPError:
            # Provider responses and exceptions may include sensitive content.
            raise EmailDeliveryError("Recovery email delivery failed") from None


def get_recovery_email_sender() -> RecoveryEmailSender:
    if settings.email_provider == "disabled" or settings.email_api_key is None:
        raise EmailDeliveryError("Recovery email is not configured")
    return ApiEmailSender(settings.email_provider, settings.email_api_key.get_secret_value(),
                          str(settings.email_from_address), settings.email_from_name)
