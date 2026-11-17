"""Threshold regression against the REAL embedding model and data/eval/kb_questions.jsonl.

Opt-in because it needs the fastembed model (downloaded once, ~220 MB): RUN_EMBEDDING_TESTS=1 npm run test:api
It pins the retrieval gate (BM25_MIN / DENSE_*) so a model or threshold change that would make a refusal
question answerable, or a fact question refuse, fails loudly.
"""

import asyncio
import json
import os
from collections.abc import Iterator

import pytest

from app.adapters.embeddings import EMBEDDING_DIM, FastEmbedEmbedder, set_embedder
from app.adapters.vectorstore import VectorStore
from app.core.config import get_settings
from app.services import kb
from app.services.retrieval import retrieve

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_EMBEDDING_TESTS") != "1", reason="set RUN_EMBEDDING_TESTS=1 to use the real model"
)

QUESTIONS_FILE = get_settings().kb_dir.parent / "eval" / "kb_questions.jsonl"
ANSWERABLE_TYPES = ("fact", "injection", "language")


def _questions(*kinds: str) -> list[dict]:
    lines = QUESTIONS_FILE.read_text(encoding="utf-8").splitlines()
    rows = [json.loads(ln) for ln in lines if ln.startswith("{")]
    return [r for r in rows if r["type"] in kinds]


@pytest.fixture(scope="module")
def real_store(tmp_path_factory: pytest.TempPathFactory) -> Iterator[VectorStore]:
    embedder = FastEmbedEmbedder(get_settings().embedding_model)
    set_embedder(embedder)
    store = VectorStore("real_kb", EMBEDDING_DIM, path=tmp_path_factory.mktemp("real-qdrant"))
    result = asyncio.run(kb.index_directory(get_settings().kb_dir, store, embedder))
    assert result.chunks > 0
    yield store
    set_embedder(None)
    store.close()


@pytest.mark.parametrize("row", _questions("refusal"), ids=lambda r: r["id"])
async def test_strict_gate_refuses_questions_the_kb_does_not_cover(row, real_store):
    res = await retrieve(row["question"], store=real_store, lenient=False)

    assert res.answerable is False
    assert res.chunks == []


@pytest.mark.parametrize("row", _questions(*ANSWERABLE_TYPES), ids=lambda r: r["id"])
async def test_every_answerable_question_reaches_its_source_document(row, real_store):
    res = await retrieve(row["question"], store=real_store, lenient=False)

    assert res.answerable is True
    assert row["source"].removesuffix(".md") in {c.doc_id for c in res.chunks}
    assert "community-forum-post" not in {c.doc_id for c in res.chunks}


async def test_credit_question_ranks_the_outage_table_first(real_store):
    res = await retrieve("How much credit do I get if my internet is down for 30 hours?", store=real_store)

    assert (res.chunks[0].doc_id, res.chunks[0].section) == ("outage-sla", "Outage credit table")
