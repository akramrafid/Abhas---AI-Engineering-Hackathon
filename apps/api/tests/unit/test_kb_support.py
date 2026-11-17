"""Shared helpers for the KB / Ask unit tests (no network, no model downloads)."""

import hashlib
import math
from collections.abc import Iterator
from pathlib import Path

import pytest

from app.adapters.embeddings import set_embedder
from app.adapters.llm import LLMClient, set_llm
from app.adapters.vectorstore import VectorStore, set_vector_store
from app.core.config import get_settings
from app.services.retrieval import tokenize

FAKE_DIM = 64


class FakeEmbedder:
    """Deterministic hashed bag-of-words vectors: related texts share tokens, so cosine similarity is real."""

    model_name = "fake-hash-embedder"
    dim = FAKE_DIM

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._vector(t) for t in texts]

    def _vector(self, text: str) -> list[float]:
        vec = [0.0] * FAKE_DIM
        for token in tokenize(text):
            # A hash embedder cannot relate Bengali to anything, so non-ASCII tokens carry no signal.
            if not token.isascii():
                continue
            vec[int(hashlib.md5(token.encode(), usedforsecurity=False).hexdigest(), 16) % FAKE_DIM] += 1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]


def make_store(tmp_path: Path, name: str = "qdrant") -> VectorStore:
    return VectorStore(collection="test_kb", dim=FAKE_DIM, path=tmp_path / name)


def write_kb(directory: Path, files: dict[str, str]) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    for name, content in files.items():
        (directory / name).write_text(content, encoding="utf-8")
    return directory


@pytest.fixture
def fake_embedder() -> Iterator[FakeEmbedder]:
    embedder = FakeEmbedder()
    set_embedder(embedder)
    yield embedder
    set_embedder(None)


@pytest.fixture
def store(tmp_path: Path, fake_embedder: FakeEmbedder) -> Iterator[VectorStore]:
    """A fresh embedded Qdrant folder installed as the process-wide store; released after the test."""
    s = make_store(tmp_path)
    set_vector_store(s)
    yield s
    set_vector_store(None)
    s.close()


def install_llm(mock_fn=None) -> LLMClient:  # noqa: ANN001
    """An LLM client in mock mode (no key, no network) with an optional scripted response."""
    client = LLMClient(get_settings(), mock_fn=mock_fn)
    assert client.mock
    set_llm(client)
    return client


@pytest.fixture
def reset_llm() -> Iterator[None]:
    yield
    set_llm(None)
