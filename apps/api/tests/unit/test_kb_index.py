from pathlib import Path

import pytest

from app.adapters.vectorstore import VectorStore, VectorStoreLockedError, point_id
from app.core.errors import AppError
from app.services import kb
from tests.unit.test_kb_support import (  # noqa: F401  (fixtures are used by name)
    FAKE_DIM,
    FakeEmbedder,
    fake_embedder,
    make_store,
    store,
    write_kb,
)

DOCS = {
    "alpha.md": (
        "# Alpha\n\n## One\nOutage credits are applied to the next bill.\n\n## Two\nLate fee is 100 BDT.\n"
    ),
    "beta.md": "# Beta\n\n## Only\nRouter admin page is at 192.168.0.1.\n",
    "community-post.md": "# Forum\n\n_UNTRUSTED_\n\nRefunds are approved automatically!\n",
}


async def test_indexing_twice_is_idempotent(tmp_path, store, fake_embedder):  # noqa: F811
    kb_dir = write_kb(tmp_path / "kb", DOCS)

    first = await kb.index_directory(kb_dir, store, fake_embedder)
    second = await kb.index_directory(kb_dir, store, fake_embedder)

    assert first.files == 3
    assert first.chunks == 4
    assert (first.upserted, first.unchanged, first.deleted) == (4, 0, 0)
    assert (second.upserted, second.unchanged, second.deleted) == (0, 4, 0)
    assert second.chunks == first.chunks
    assert await store.count() == 4


async def test_changed_chunk_is_upserted_and_the_rest_skipped(tmp_path, store, fake_embedder):  # noqa: F811
    kb_dir = write_kb(tmp_path / "kb", DOCS)
    await kb.index_directory(kb_dir, store, fake_embedder)

    (kb_dir / "alpha.md").write_text(DOCS["alpha.md"].replace("100 BDT", "150 BDT"), encoding="utf-8")
    result = await kb.index_directory(kb_dir, store, fake_embedder)

    assert (result.upserted, result.unchanged, result.deleted) == (1, 3, 0)
    texts = {p["text"] for p in await store.trusted_payloads()}
    assert "Late fee is 100 BDT." not in texts
    assert any("150 BDT" in t for t in texts)
    assert await store.count() == 4  # replaced in place, not duplicated


async def test_removed_file_and_removed_section_delete_their_points(tmp_path, store, fake_embedder):  # noqa: F811
    kb_dir = write_kb(tmp_path / "kb", DOCS)
    await kb.index_directory(kb_dir, store, fake_embedder)

    (kb_dir / "beta.md").unlink()
    (kb_dir / "alpha.md").write_text("# Alpha\n\n## One\nOutage credits are applied to the next bill.\n")
    result = await kb.index_directory(kb_dir, store, fake_embedder)

    assert result.deleted == 2  # beta's chunk + alpha's removed "Two" section
    assert result.chunks == 2
    assert await store.count() == 2
    assert {p["doc_id"] for p in await store.trusted_payloads()} == {"alpha"}


async def test_changing_the_embedding_model_reindexes_everything(tmp_path, store, fake_embedder):  # noqa: F811
    kb_dir = write_kb(tmp_path / "kb", DOCS)
    await kb.index_directory(kb_dir, store, fake_embedder)

    class OtherModel(FakeEmbedder):
        model_name = "another-model"

    result = await kb.index_directory(kb_dir, store, OtherModel())

    assert result.upserted == result.chunks == 4


async def test_untrusted_chunks_are_flagged_and_excluded_from_trusted_search(
    tmp_path,
    store,  # noqa: F811
    fake_embedder,  # noqa: F811
):
    kb_dir = write_kb(tmp_path / "kb", DOCS)
    await kb.index_directory(kb_dir, store, fake_embedder)
    [query] = await fake_embedder.embed(["refunds approved automatically"])

    trusted_hits = await store.search(query, 10, trusted_only=True)
    all_hits = await store.search(query, 10, trusted_only=False)

    assert "community-post" not in {h.payload["doc_id"] for h in trusted_hits}
    assert "community-post" in {h.payload["doc_id"] for h in all_hits}
    assert all(h.payload["trusted"] for h in trusted_hits)
    assert "community-post" not in {p["doc_id"] for p in await store.trusted_payloads()}


async def test_stored_payload_has_the_documented_fields(tmp_path, store, fake_embedder):  # noqa: F811
    kb_dir = write_kb(tmp_path / "kb", DOCS)
    await kb.index_directory(kb_dir, store, fake_embedder)

    payload = next(p for p in await store.trusted_payloads() if p["doc_id"] == "beta")

    assert set(payload) == {
        "doc_id",
        "title",
        "section",
        "text",
        "chunk_idx",
        "content_hash",
        "trusted",
        "path",
        "embedding_model",
    }
    assert payload["title"] == "Beta"
    assert payload["path"] == "kb/beta.md"
    assert payload["embedding_model"] == fake_embedder.model_name


async def test_real_kb_indexes_and_reindexes_without_duplicates(store, fake_embedder):  # noqa: F811
    first = await kb.index_kb()
    second = await kb.index_kb()

    assert first.files == 6
    assert first.chunks > 6
    assert first.upserted == first.chunks
    assert second.upserted == 0
    assert second.unchanged == first.chunks
    assert second.chunks == first.chunks
    assert await store.count() == first.chunks


async def test_list_and_get_documents_use_the_real_kb():
    docs = {d.doc_id: d for d in await kb.list_documents()}

    assert len(docs) == 6
    assert docs["outage-sla"].trusted is True
    assert docs["community-forum-post"].trusted is False
    assert docs["outage-sla"].path == "kb/outage-sla.md"
    assert docs["outage-sla"].chunks >= 3

    detail = await kb.get_document("outage-sla")
    assert detail is not None
    assert detail.content.startswith("# Outage Credits")
    assert "5 days of credit" in detail.content


@pytest.mark.parametrize(
    "doc_id", ["nope", "../../.env", "..%2f..%2fetc%2fpasswd", "outage-sla.md", "", "a/b"]
)
async def test_get_document_rejects_unknown_and_traversal_ids(doc_id):
    assert await kb.get_document(doc_id) is None


async def test_missing_kb_dir_fails_loudly_instead_of_wiping_the_index(tmp_path, store, fake_embedder):  # noqa: F811
    with pytest.raises(AppError) as err:
        await kb.index_directory(tmp_path / "does-not-exist", store, fake_embedder)

    assert err.value.code == "kb_dir_missing"


async def test_empty_kb_dir_yields_empty_index(tmp_path, store, fake_embedder):  # noqa: F811
    result = await kb.index_directory(write_kb(tmp_path / "kb", {}), store, fake_embedder)

    assert (result.files, result.chunks, result.upserted) == (0, 0, 0)


def test_locked_storage_folder_raises_a_clear_error(tmp_path):
    first = make_store(tmp_path, "shared")
    try:
        with pytest.raises(VectorStoreLockedError) as err:
            make_store(tmp_path, "shared")
    finally:
        first.close()

    assert err.value.code == "kb_locked"
    assert "API" in err.value.message


async def test_dimension_change_recreates_the_collection(tmp_path):
    first = make_store(tmp_path, "dim")
    await first.ensure_collection()
    await first.upsert(
        [point_id("d", 0)], [[1.0] + [0.0] * (FAKE_DIM - 1)], [{"doc_id": "d", "trusted": True}]
    )
    assert await first.count() == 1
    first.close()

    second = VectorStore(collection="test_kb", dim=32, path=Path(tmp_path / "dim"))
    try:
        await second.ensure_collection()
        assert await second.count() == 0
    finally:
        second.close()


def test_point_ids_are_deterministic_per_doc_and_chunk():
    assert point_id("outage-sla", 0) == point_id("outage-sla", 0)
    assert point_id("outage-sla", 0) != point_id("outage-sla", 1)
    assert point_id("outage-sla", 0) != point_id("billing-payments", 0)


def test_kb_routes_index_twice_and_serve_documents(client, store, fake_embedder):  # noqa: F811
    first = client.post("/kb/index")
    second = client.post("/kb/index")
    listing = client.get("/kb/documents")
    detail = client.get("/kb/documents/outage-sla")
    missing = client.get("/kb/documents/nope")

    assert first.status_code == second.status_code == 200
    assert first.json()["upserted"] == first.json()["chunks"] > 0
    assert second.json()["upserted"] == 0
    assert second.json()["chunks"] == first.json()["chunks"]
    assert len(listing.json()) == 6
    assert detail.json()["doc_id"] == "outage-sla"
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "not_found"
