"""Qdrant adapter (local embedded mode by default, server mode when QDRANT_URL is set).

Embedded mode locks its storage folder, so there is exactly ONE process-wide client (`get_vector_store()`).
The client is synchronous; calls run in a worker thread and are serialised with a lock so the event loop
never blocks and the embedded engine is never entered concurrently.
"""

import asyncio
import atexit
import logging
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from qdrant_client import QdrantClient, models

from app.adapters.embeddings import EMBEDDING_DIM
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.logging import log_event

log = logging.getLogger("app.vectorstore")

POINT_NAMESPACE = uuid.UUID("6f1c2a52-9a0e-4b8a-9a64-5c2f3c1d7e10")  # fixed -> deterministic point ids
REQUEST_TIMEOUT_S = 10
UPSERT_BATCH = 128
SCROLL_PAGE = 256


def point_id(doc_id: str, chunk_idx: int) -> str:
    return str(uuid.uuid5(POINT_NAMESPACE, f"{doc_id}:{chunk_idx}"))


@dataclass(frozen=True)
class Hit:
    score: float
    payload: dict[str, Any]


@dataclass(frozen=True)
class StoredChunk:
    point_id: str
    doc_id: str
    content_hash: str


class VectorStoreLockedError(AppError):
    """The embedded Qdrant folder is held by another process (usually the running API)."""

    def __init__(self, path: str) -> None:
        super().__init__(
            "kb_locked",
            f"The vector store folder '{path}' is in use by another process (is the API running?). "
            "Stop it and retry, or call POST /kb/index on the running API instead.",
            503,
        )


class VectorStore:
    def __init__(self, collection: str, dim: int, path: Path | None = None, url: str = "") -> None:
        self.collection = collection
        self.dim = dim
        self.uid = uuid.uuid4().hex
        self._remote = bool(url)
        self._closed = False
        self.version = 0  # bumped on every write; lets readers invalidate caches built from the index
        self._lock = threading.Lock()
        try:
            self._client = (
                QdrantClient(url=url, timeout=REQUEST_TIMEOUT_S) if url else QdrantClient(path=str(path))
            )
        except RuntimeError as exc:
            if "already accessed" in str(exc):
                raise VectorStoreLockedError(str(path)) from exc
            raise

    async def _run(self, fn, *args, **kwargs):  # noqa: ANN001, ANN202
        def call():  # noqa: ANN202
            with self._lock:
                return fn(*args, **kwargs)

        t0 = time.perf_counter()
        try:
            return await asyncio.to_thread(call)
        except AppError:
            raise
        except Exception as exc:
            log.exception("vectorstore_failed")
            raise AppError(
                "vectorstore_unavailable", "The search index is unavailable. Please try again.", 503
            ) from exc
        finally:
            log_event(
                log,
                "vectorstore_call",
                op=getattr(fn, "__name__", "call"),
                latency_ms=round((time.perf_counter() - t0) * 1000, 1),
            )

    def _ensure_collection(self) -> None:
        c = self._client
        if c.collection_exists(self.collection):
            existing = c.get_collection(self.collection).config.params.vectors
            size = existing.size if isinstance(existing, models.VectorParams) else None
            if size == self.dim:
                return
            log_event(log, "collection_recreated", reason="dimension_mismatch", old=size, new=self.dim)
            # Embedded mode keeps the old points on disk after delete_collection and resurrects them when the
            # name is reused (even at another dimension), so empty the collection first.
            c.delete(
                self.collection, points_selector=models.FilterSelector(filter=models.Filter()), wait=True
            )
            c.delete_collection(self.collection)
        c.create_collection(
            self.collection,
            vectors_config=models.VectorParams(size=self.dim, distance=models.Distance.COSINE),
        )
        if self._remote:  # payload indexes only exist on a Qdrant server; embedded mode ignores them
            c.create_payload_index(
                self.collection, field_name="doc_id", field_schema=models.PayloadSchemaType.KEYWORD
            )
            c.create_payload_index(
                self.collection, field_name="trusted", field_schema=models.PayloadSchemaType.BOOL
            )

    async def ensure_collection(self) -> None:
        await self._run(self._ensure_collection)

    def _stored_chunks(self) -> list[StoredChunk]:
        if not self._client.collection_exists(self.collection):
            return []
        out: list[StoredChunk] = []
        offset = None
        while True:
            points, offset = self._client.scroll(
                self.collection,
                limit=SCROLL_PAGE,
                offset=offset,
                with_payload=["doc_id", "content_hash"],
                with_vectors=False,
            )
            for p in points:
                payload = p.payload or {}
                out.append(StoredChunk(str(p.id), payload.get("doc_id", ""), payload.get("content_hash", "")))
            if offset is None:
                return out

    async def stored_chunks(self) -> list[StoredChunk]:
        return await self._run(self._stored_chunks)

    def _upsert(self, ids: list[str], vectors: list[list[float]], payloads: list[dict]) -> None:
        for i in range(0, len(ids), UPSERT_BATCH):
            sl = slice(i, i + UPSERT_BATCH)
            self._client.upsert(
                self.collection,
                points=models.Batch(ids=ids[sl], vectors=vectors[sl], payloads=payloads[sl]),
                wait=True,
            )

    async def upsert(self, ids: list[str], vectors: list[list[float]], payloads: list[dict]) -> None:
        if ids:
            await self._run(self._upsert, ids, vectors, payloads)
            self.version += 1

    def _delete(self, ids: list[str]) -> None:
        self._client.delete(self.collection, points_selector=models.PointIdsList(points=ids), wait=True)

    async def delete(self, ids: list[str]) -> None:
        if ids:
            await self._run(self._delete, ids)
            self.version += 1

    def _trusted_payloads(self) -> list[dict[str, Any]]:
        if not self._client.collection_exists(self.collection):
            return []
        flt = models.Filter(must=[models.FieldCondition(key="trusted", match=models.MatchValue(value=True))])
        out: list[dict[str, Any]] = []
        offset = None
        while True:
            points, offset = self._client.scroll(
                self.collection, scroll_filter=flt, limit=SCROLL_PAGE, offset=offset, with_vectors=False
            )
            out.extend(dict(p.payload or {}) for p in points)
            if offset is None:
                return out

    async def trusted_payloads(self) -> list[dict[str, Any]]:
        """Payloads of every trusted chunk (feeds the lexical half of hybrid retrieval)."""
        return await self._run(self._trusted_payloads)

    def _search(self, vector: list[float], k: int, trusted_only: bool) -> list[Hit]:
        if not self._client.collection_exists(self.collection):
            return []
        flt = (
            models.Filter(must=[models.FieldCondition(key="trusted", match=models.MatchValue(value=True))])
            if trusted_only
            else None
        )
        res = self._client.query_points(
            self.collection, query=vector, limit=k, query_filter=flt, with_payload=True
        )
        return [Hit(score=float(p.score), payload=dict(p.payload or {})) for p in res.points]

    async def search(self, vector: list[float], k: int, trusted_only: bool = True) -> list[Hit]:
        return await self._run(self._search, vector, k, trusted_only)

    def _count(self) -> int:
        if not self._client.collection_exists(self.collection):
            return 0
        return self._client.count(self.collection, exact=True).count

    async def count(self) -> int:
        return await self._run(self._count)

    def close(self) -> None:
        if not self._closed:
            self._closed = True
            self._client.close()


_store: VectorStore | None = None


def get_vector_store() -> VectorStore:
    """Process-wide store; created on first use so importing the app never touches the storage folder."""
    global _store
    if _store is None:
        s = get_settings()
        _store = VectorStore(
            collection=s.qdrant_collection,
            dim=EMBEDDING_DIM,
            path=None if s.qdrant_url else s.resolve(s.qdrant_path),
            url=s.qdrant_url,
        )
        atexit.register(_store.close)  # release the folder lock before interpreter teardown
    return _store


def set_vector_store(store: VectorStore | None) -> None:
    """Test hook."""
    global _store
    _store = store
