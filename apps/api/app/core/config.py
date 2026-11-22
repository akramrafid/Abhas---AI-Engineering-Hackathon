"""Typed settings. Every value has a safe default so the app runs with zero keys."""

import ipaddress
from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

API_DIR = Path(__file__).resolve().parents[2]  # apps/api
REPO_ROOT = API_DIR.parents[1]

_BLOCKED_HOSTS = frozenset({"localhost", "metadata.google.internal", "metadata"})
_BLOCKED_HOST_SUFFIXES = (".localhost", ".local", ".internal")


def _is_non_public_host(hostname: str) -> bool:
    host = hostname.strip().lower().rstrip(".")
    if not host or host in _BLOCKED_HOSTS or host.endswith(_BLOCKED_HOST_SUFFIXES):
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", API_DIR / ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    app_env: Literal["dev", "test", "production"] = "dev"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    database_url: str = f"sqlite:///{(REPO_ROOT / 'data' / 'abhas.db').as_posix()}"
    raw_dataset_path: Path = REPO_ROOT / "data" / "raw" / "hackathon_preli_dataset.xlsx"
    raw_dataset_sheet: str = "bangladesh_dengue_large_dataset"

    model_path: Path = API_DIR / "ml" / "artifacts" / "current.joblib"

    weather_mode: Literal["dataset", "live"] = "dataset"
    open_meteo_base_url: str = "https://api.open-meteo.com/v1/forecast"
    weather_cache_ttl_hours: float = Field(default=6.0, gt=0, allow_inf_nan=False)
    weather_connect_timeout_s: float = Field(default=5.0, gt=0, allow_inf_nan=False)
    weather_read_timeout_s: float = Field(default=10.0, gt=0, allow_inf_nan=False)

    anthropic_api_key: SecretStr | None = None
    llm_model: str = "claude-haiku-5-5"
    llm_max_output_tokens: int = Field(default=400, ge=1, le=1000)
    llm_daily_budget_usd: float = Field(default=1.0, gt=0, allow_inf_nan=False)
    llm_timeout_s: float = Field(default=20.0, gt=0, allow_inf_nan=False)

    gemini_api_key: SecretStr | None = None
    gemini_api_key_fallback: SecretStr | None = None
    gemini_model: str = "gemini-2.5-flash"
    gemini_max_output_tokens: int = Field(default=512, ge=32, le=1024)
    gemini_timeout_s: float = Field(default=15.0, gt=0, allow_inf_nan=False)

    ops_token: SecretStr | None = None
    rate_limit_per_minute: int = Field(default=120, ge=1)
    trusted_proxies: str = ""
    fault_inject: str = ""

    @field_validator("app_env", mode="before")
    @classmethod
    def _normalize_app_env(cls, value: object) -> object:
        if isinstance(value, str):
            cleaned = value.strip().lower()
            return "production" if cleaned == "prod" else cleaned
        return value

    @field_validator("cors_origins", mode="after")
    @classmethod
    def _validate_cors_origins(cls, value: str) -> str:
        for raw in value.split(","):
            origin = raw.strip()
            if not origin:
                continue
            if origin.lower() in {"*", "null"}:
                raise ValueError("CORS_ORIGINS must not contain '*' or 'null'")
            parsed = urlparse(origin)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.hostname
                or parsed.path
                or parsed.query
                or parsed.fragment
                or parsed.username
                or parsed.password
            ):
                raise ValueError(f"Invalid CORS origin {origin!r}: expected bare http:// or https:// origin")
        return value

    @field_validator("database_url", mode="after")
    @classmethod
    def _anchor_sqlite_url(cls, value: str) -> str:
        prefix = "sqlite:///"
        if not value.startswith(prefix) or value == "sqlite:///:memory:":
            return value
        raw_path = value[len(prefix) :]
        p = Path(raw_path)
        if not p.is_absolute():
            p = (REPO_ROOT / p).resolve()
        p.parent.mkdir(parents=True, exist_ok=True)
        return f"{prefix}{p.as_posix()}"

    @field_validator("model_path", "raw_dataset_path", mode="after")
    @classmethod
    def _anchor_repo_path(cls, value: Path) -> Path:
        return value if value.is_absolute() else (REPO_ROOT / value).resolve()

    @model_validator(mode="after")
    def _validate_external_urls(self) -> "Settings":
        parsed = urlparse(self.open_meteo_base_url.strip())
        if not parsed.hostname:
            raise ValueError("OPEN_METEO_BASE_URL must include a hostname")
        if self.app_env == "test":
            if parsed.scheme not in {"http", "https"}:
                raise ValueError("OPEN_METEO_BASE_URL must use http:// or https:// in test mode")
            return self
        if parsed.scheme != "https":
            raise ValueError("OPEN_METEO_BASE_URL must use https:// outside APP_ENV=test")
        if _is_non_public_host(parsed.hostname):
            raise ValueError("OPEN_METEO_BASE_URL must not target loopback, private, or metadata hosts")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def trusted_proxy_set(self) -> frozenset[str]:
        return frozenset(p.strip() for p in self.trusted_proxies.split(",") if p.strip())

    @property
    def llm_enabled(self) -> bool:
        return bool(self.anthropic_api_key and self.anthropic_api_key.get_secret_value())

    @property
    def chat_llm_enabled(self) -> bool:
        has_primary = bool(self.gemini_api_key and self.gemini_api_key.get_secret_value().strip())
        has_fallback = bool(
            self.gemini_api_key_fallback and self.gemini_api_key_fallback.get_secret_value().strip()
        )
        return has_primary or has_fallback


@lru_cache
def get_settings() -> Settings:
    return Settings()


def active_faults(settings: Settings | None = None) -> frozenset[str]:
    """Return active FAULT_INJECT tokens strictly when APP_ENV=test; always empty otherwise."""
    cfg = settings or get_settings()
    if cfg.app_env != "test" or not cfg.fault_inject.strip():
        return frozenset()
    return frozenset(tok.strip().lower() for tok in cfg.fault_inject.split(",") if tok.strip())
