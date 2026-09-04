import logging
from uuid import UUID, uuid4

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response

from app.core.config import settings
from app.core.security_monitoring import emit_security_event


UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def log_security_event(
    request: Request,
    event: str,
    outcome: str,
    *,
    user_id: UUID | None = None,
    level: int = logging.INFO,
) -> None:
    """Emit a security event without credentials, tokens, emails, request bodies, or IPs."""
    emit_security_event(
        event=event,
        outcome=outcome,
        request_id=getattr(request.state, "request_id", "unavailable"),
        user_id=user_id,
        level=level,
    )


class SecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        request_id = uuid4().hex
        request.state.request_id = request_id

        response = self._reject_cross_site_request(request)
        if response is None:
            try:
                response = await call_next(request)
            except Exception:
                log_security_event(
                    request,
                    "unhandled_exception",
                    "error",
                    level=logging.ERROR,
                )
                raise

        if response.status_code >= 500:
            log_security_event(
                request,
                "server_error_response",
                "observed",
                level=logging.ERROR,
            )

        self._apply_headers(response, request_id, request.url.path)
        return response

    def _reject_cross_site_request(self, request: Request) -> Response | None:
        if not request.url.path.startswith("/api/") or request.method not in UNSAFE_METHODS:
            return None

        origin = request.headers.get("origin")
        fetch_site = request.headers.get("sec-fetch-site")
        origin_is_untrusted = origin is not None and origin != settings.frontend_origin
        browser_declares_cross_site = fetch_site == "cross-site"

        if not origin_is_untrusted and not browser_declares_cross_site:
            return None

        log_security_event(
            request,
            "cross_site_request",
            "rejected",
            level=logging.WARNING,
        )
        return JSONResponse(
            status_code=403,
            content={
                "error": {
                    "code": "cross_site_request_rejected",
                    "message": "Cross-site request rejected",
                    "requestId": getattr(request.state, "request_id", "unavailable"),
                }
            },
        )

    @staticmethod
    def _apply_headers(response: Response, request_id: str, path: str) -> None:
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"

        if path.startswith("/api/") or path == "/health":
            response.headers["Cache-Control"] = "no-store"

        if settings.app_env == "production":
            response.headers["Strict-Transport-Security"] = (
                "max-age=63072000; includeSubDomains"
            )
