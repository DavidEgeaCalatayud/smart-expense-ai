"""Validate the release environment before migrations or serving on Render."""
import os
import sys
from urllib.parse import urlsplit


def prepare_environment(source: dict[str, str]) -> dict[str, str]:
    env = dict(source)
    if env.get("APP_ENV") not in {"staging", "production"}:
        raise ValueError("APP_ENV must be staging or production")
    if env.get("AUTH_COOKIE_SECURE", "").lower() != "true":
        raise ValueError("AUTH_COOKIE_SECURE must be true")
    if env.get("APP_DEBUG", "").lower() != "false":
        raise ValueError("APP_DEBUG must be false")

    origin = env.get("FRONTEND_ORIGIN", "").strip()
    try:
        parsed = urlsplit(origin)
        host = parsed.hostname or ""
        valid = (
            parsed.scheme == "https" and "." in host
            and not parsed.username and not parsed.password
            and not parsed.query and not parsed.fragment
            and parsed.path in {"", "/"} and parsed.port in {None, 443}
            and host != "localhost" and not host.startswith("127.")
            and not host.endswith((".invalid", ".test", ".example", ".localhost"))
            and host not in {"example.com", "example.net", "example.org"}
        )
    except ValueError:
        valid = False
    if not valid:
        raise ValueError("FRONTEND_ORIGIN must be the actual public HTTPS web origin")

    if not env.get("DATABASE_URL", "").startswith(("postgresql://", "postgresql+psycopg://")):
        raise ValueError("A managed PostgreSQL DATABASE_URL is required")
    if len(env.get("JWT_SECRET", "").encode()) < 32:
        raise ValueError("JWT_SECRET must contain at least 32 bytes")
    env["FRONTEND_ORIGIN"] = origin.rstrip("/")
    env["ALLOWED_HOSTS"] = f"{host},localhost,127.0.0.1"
    return env


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"migrate", "serve"}:
        raise SystemExit("Usage: render_start.py migrate|serve")
    try:
        env = prepare_environment(dict(os.environ))
    except ValueError as error:
        # Errors name the setting but never echo configuration/credential values.
        raise SystemExit(str(error)) from None
    command = (
        [sys.executable, "-m", "alembic", "upgrade", "head"]
        if sys.argv[1] == "migrate"
        else [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0",
              "--port", "8000", "--no-access-log", "--no-proxy-headers"]
    )
    os.execve(sys.executable, command, env)


if __name__ == "__main__":
    main()
