import os

os.environ["LLM_MOCK"] = "1"  # tests never call a real provider

from collections.abc import Iterator  # noqa: E402
from pathlib import Path  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.adapters.embeddings import set_embedder  # noqa: E402
from app.adapters.llm import set_llm  # noqa: E402
from app.adapters.vectorstore import set_vector_store  # noqa: E402
from app.main import create_app  # noqa: E402
from tests.unit.test_kb_support import FakeEmbedder, make_store  # noqa: E402


@pytest.fixture(autouse=True)
def _isolated_backends(tmp_path: Path) -> Iterator[None]:
    """Every test gets a throwaway Qdrant folder + fake embedder, so tests never touch apps/api/.qdrant
    (which a running API holds locked) and never download a model."""
    set_embedder(FakeEmbedder())
    store = make_store(tmp_path, "conftest-qdrant")
    set_vector_store(store)
    yield
    set_vector_store(None)
    store.close()
    set_embedder(None)
    set_llm(None)


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())
