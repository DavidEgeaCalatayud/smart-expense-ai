from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    app_name: str = "Smart Expense AI"
    app_env: Literal["development", "test", "docker", "staging", "production"] = "development"
    app_debug: bool = False
    backend_host: str = "127.0.0.1"
    backend_port: int = 8000
    frontend_origin: str = "http://localhost:5173"
    allowed_hosts: str = "localhost,127.0.0.1,testserver"
    database_url: str
    jwt_secret: str
    jwt_algorithm: Literal["HS256"] = "HS256"
    jwt_issuer: str = "smart-expense-ai"
    jwt_audience: str = "smart-expense-ai-web"
    access_token_minutes: int = 60
    auth_cookie_name: str = "smart_expense_session"
    auth_cookie_secure: bool = False
    openai_api_key: str | None = None
    financial_assistant_model: str = "gpt-5.6-terra"
    financial_assistant_reasoning_effort: Literal["none", "low", "medium", "high", "xhigh", "max"] = "low"
    financial_assistant_max_tool_rounds: int = 5
    financial_assistant_max_tool_calls: int = 12
    financial_assistant_max_output_tokens: int = 1600

    model_config = SettingsConfigDict(
        env_file=REPOSITORY_ROOT / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg://", 1)
        return value

    @field_validator("jwt_secret")
    @classmethod
    def validate_jwt_secret(cls, value: str) -> str:
        if len(value.encode("utf-8")) < 32:
            raise ValueError("JWT_SECRET must contain at least 32 bytes")
        return value

    @field_validator("openai_api_key", mode="before")
    @classmethod
    def normalize_optional_api_key(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @model_validator(mode="after")
    def enforce_environment_security(self) -> "Settings":
        if self.app_env in {"staging", "production"} and not self.auth_cookie_secure:
            raise ValueError("AUTH_COOKIE_SECURE must be true in staging and production")
        if self.app_env == "production" and self.app_debug:
            raise ValueError("APP_DEBUG must be false in production")
        if self.financial_assistant_max_tool_rounds < 1:
            raise ValueError("FINANCIAL_ASSISTANT_MAX_TOOL_ROUNDS must be at least 1")
        if self.financial_assistant_max_tool_calls < 1:
            raise ValueError("FINANCIAL_ASSISTANT_MAX_TOOL_CALLS must be at least 1")
        if self.financial_assistant_max_output_tokens < 256:
            raise ValueError("FINANCIAL_ASSISTANT_MAX_OUTPUT_TOKENS must be at least 256")
        return self

    @property
    def allowed_host_list(self) -> list[str]:
        return [host.strip() for host in self.allowed_hosts.split(",") if host.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
