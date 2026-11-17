"""Typed settings loaded from environment / the repo-root .env. Never log secret values."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

API_DIR = Path(__file__).resolve().parents[2]  # apps/api
REPO_ROOT = API_DIR.parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", API_DIR / ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    # LLM (OpenAI-compatible)
    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: SecretStr = SecretStr("")
    llm_model: str = "gpt-4o-mini"
    llm_fallback_model: str = ""
    llm_mock: bool = False
    llm_timeout_s: float = 30.0
    llm_max_retries: int = 2
    llm_price_in_per_mtok: float = 0.15
    llm_price_out_per_mtok: float = 0.60

    # Embeddings
    embedding_provider: str = "local"
    embedding_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

    # Vector store
    qdrant_path: str = "./.qdrant"
    qdrant_url: str = ""
    qdrant_collection: str = "lumadesk_kb"

    # App data
    database_url: str = "sqlite:///./lumadesk.db"
    data_dir: str = "../../data"

    # Server
    api_port: int = 8000
    cors_origins: str = "http://localhost:3000,http://localhost:3001"
    log_level: str = "INFO"
    max_question_chars: int = Field(default=2000, ge=10)
    max_ticket_chars: int = Field(default=8000, ge=10)

    def resolve(self, value: str) -> Path:
        """Resolve a path setting relative to apps/api."""
        p = Path(value)
        return p if p.is_absolute() else (API_DIR / p).resolve()

    @property
    def kb_dir(self) -> Path:
        return self.resolve(self.data_dir) / "kb"

    @property
    def tickets_file(self) -> Path:
        return self.resolve(self.data_dir) / "tickets" / "sample_tickets.jsonl"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def llm_enabled(self) -> bool:
        return not self.llm_mock and bool(self.llm_api_key.get_secret_value())


@lru_cache
def get_settings() -> Settings:
    return Settings()
