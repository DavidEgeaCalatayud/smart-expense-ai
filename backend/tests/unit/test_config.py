import pytest
from pydantic import ValidationError

from app.core.config import Settings


DATABASE_URL = "postgresql+psycopg://user:password@localhost:5432/test"
STRONG_SECRET = "x" * 32


def build_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "database_url": DATABASE_URL,
        "jwt_secret": STRONG_SECRET,
        "app_env": "test",
        "app_debug": False,
        "auth_cookie_secure": False,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_rejects_short_jwt_secret() -> None:
    with pytest.raises(ValidationError, match="at least 32 bytes"):
        build_settings(jwt_secret="too-short")


def test_staging_and_production_require_secure_cookie() -> None:
    with pytest.raises(ValidationError, match="AUTH_COOKIE_SECURE"):
        build_settings(app_env="staging", auth_cookie_secure=False)

    with pytest.raises(ValidationError, match="AUTH_COOKIE_SECURE"):
        build_settings(app_env="production", auth_cookie_secure=False)


def test_production_rejects_debug_mode() -> None:
    with pytest.raises(ValidationError, match="APP_DEBUG"):
        build_settings(
            app_env="production",
            app_debug=True,
            auth_cookie_secure=True,
        )


def test_production_accepts_hardened_settings() -> None:
    settings = build_settings(
        app_env="production",
        app_debug=False,
        auth_cookie_secure=True,
        allowed_hosts="finance.example.com",
        frontend_origin="https://finance.example.com",
    )

    assert settings.allowed_host_list == ["finance.example.com"]
