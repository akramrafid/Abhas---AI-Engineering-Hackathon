"""Typed settings. Every value has a safe default so the app runs with zero keys."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

API_DIR = Path(__file__).resolve().parents[2]  # apps/api
REPO_ROOT = API_DIR.parents[1]


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
    weather_cache_ttl_hours: float = 6.0
    weather_connect_timeout_s: float = 5.0
    weather_read_timeout_s: float = 10.0

    anthropic_api_key: SecretStr | None = None
    llm_model: str = "claude-haiku-5-5"
    llm_max_output_tokens: int = Field(default=400, ge=1, le=1000)
    llm_daily_budget_usd: float = Field(default=1.0, ge=0)
    llm_timeout_s: float = 20.0

    ops_token: SecretStr | None = None
    rate_limit_per_minute: int = Field(default=120, ge=1)
    fault_inject: str = ""

    @field_validator("app_env", mode="before")
    @classmethod
    def _normalize_app_env(cls, value: object) -> object:
        if isinstance(value, str):
            cleaned = value.strip().lower()
            return "production" if cleaned == "prod" else cleaned
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

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def llm_enabled(self) -> bool:
        return bool(self.anthropic_api_key and self.anthropic_api_key.get_secret_value())


@lru_cache
def get_settings() -> Settings:
    return Settings()


def active_faults(settings: Settings | None = None) -> frozenset[str]:
    """Return active FAULT_INJECT tokens strictly when APP_ENV=test; always empty otherwise."""
    cfg = settings or get_settings()
    if cfg.app_env != "test" or not cfg.fault_inject.strip():
        return frozenset()
    return frozenset(tok.strip().lower() for tok in cfg.fault_inject.split(",") if tok.strip())
