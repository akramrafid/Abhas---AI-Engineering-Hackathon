"""Local multilingual embeddings (fastembed / ONNX, CPU). Lazily loaded process-wide singleton.

Services call `get_embedder()`; never import `fastembed` elsewhere. Tests inject a fake via `set_embedder`.
"""

import asyncio
import logging
import threading
import time
from typing import Protocol

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.logging import log_event

log = logging.getLogger("app.embeddings")

EMBEDDING_DIM = 384  # paraphrase-multilingual-MiniLM-L12-v2


class Embedder(Protocol):
    model_name: str
    dim: int

    async def embed(self, texts: list[str]) -> list[list[float]]: ...


class FastEmbedEmbedder:
    """fastembed `TextEmbedding`, loaded on first use and run off the event loop."""

    dim = EMBEDDING_DIM

    def __init__(self, model_name: str) -> None:
        self.model_name = model_name
        self._model = None
        self._lock = threading.Lock()
        self._infer_lock = threading.Lock()

    def _load(self):  # noqa: ANN202
        with self._lock:
            if self._model is None:
                from fastembed import TextEmbedding  # heavy import, keep lazy

                t0 = time.perf_counter()
                self._model = TextEmbedding(model_name=self.model_name)
                log_event(
                    log,
                    "embedding_model_loaded",
                    model=self.model_name,
                    latency_ms=round((time.perf_counter() - t0) * 1000, 1),
                )
        return self._model

    def _embed_sync(self, texts: list[str]) -> list[list[float]]:
        model = self._load()
        with self._infer_lock:  # CPU-bound; one inference at a time also avoids tokenizer state races
            return [vec.tolist() for vec in model.embed(texts)]

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        try:
            return await asyncio.to_thread(self._embed_sync, texts)
        except Exception as exc:
            log.exception("embedding_failed")
            raise AppError(
                "embedding_unavailable",
                "The search index is unavailable (embedding model could not run). Please try again.",
                503,
            ) from exc


_embedder: Embedder | None = None


def get_embedder() -> Embedder:
    global _embedder
    if _embedder is None:
        settings = get_settings()
        if settings.embedding_provider != "local":
            raise AppError(
                "embedding_unavailable",
                f"EMBEDDING_PROVIDER={settings.embedding_provider!r} is not supported; use 'local'.",
                503,
            )
        _embedder = FastEmbedEmbedder(settings.embedding_model)
    return _embedder


def set_embedder(embedder: Embedder | None) -> None:
    """Test hook."""
    global _embedder
    _embedder = embedder
