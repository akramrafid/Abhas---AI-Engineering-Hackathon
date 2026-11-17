"""CR-3: real-embedding check that triage retrieval finds the right KB doc, Bangla tickets included.

Opt-in (needs the fastembed model): RUN_EMBEDDING_TESTS=1 npm run test:api. No LLM calls.
"""

import asyncio
import json
import os
from collections.abc import Iterator

import pytest

from app.adapters.embeddings import EMBEDDING_DIM, FastEmbedEmbedder, set_embedder
from app.adapters.vectorstore import VectorStore, set_vector_store
from app.core.config import get_settings
from app.services import kb
from app.services import triage as svc

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_EMBEDDING_TESTS") != "1", reason="set RUN_EMBEDDING_TESTS=1 to use the real model"
)

EXPECTED_TOP_DOC = {
    "T-001": "outage-sla",
    "T-003": "technical-troubleshooting",
    "T-012": "account-security-cancellation",
    "T-016": "outage-sla",
}
TICKETS = {
    t["id"]: t
    for t in (
        json.loads(line)
        for line in get_settings().tickets_file.read_text(encoding="utf-8").splitlines()
        if line.strip()
    )
}


@pytest.fixture(scope="module")
def real_store(tmp_path_factory: pytest.TempPathFactory) -> Iterator[VectorStore]:
    embedder = FastEmbedEmbedder(get_settings().embedding_model)
    set_embedder(embedder)
    store = VectorStore("real_triage_kb", EMBEDDING_DIM, path=tmp_path_factory.mktemp("triage-qdrant"))
    asyncio.run(kb.index_directory(get_settings().kb_dir, store, embedder))
    yield store
    store.close()


@pytest.mark.parametrize("tid", sorted(EXPECTED_TOP_DOC))
async def test_triage_retrieval_finds_source_doc(tid, real_store):
    set_embedder(FastEmbedEmbedder(get_settings().embedding_model))
    set_vector_store(real_store)
    cites = await svc._retrieve(TICKETS[tid]["text"])
    assert cites, tid
    assert cites[0].doc_id == EXPECTED_TOP_DOC[tid], [c.doc_id for c in cites]
    assert all(c.doc_id != "community-forum-post" for c in cites)
