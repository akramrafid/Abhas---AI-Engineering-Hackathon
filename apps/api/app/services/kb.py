"""KB indexing + retrieval. STUB — owned by core-kb (BUILDER-CORE)."""

from app.schemas import DocumentDetail, DocumentSummary, IndexResult


async def index_kb() -> IndexResult:
    return IndexResult(files=0, chunks=0, upserted=0, unchanged=0, deleted=0, duration_ms=0.0)


async def list_documents() -> list[DocumentSummary]:
    return [
        DocumentSummary(
            doc_id="outage-sla",
            title="Outage Credits and SLA",
            path="kb/outage-sla.md",
            trusted=True,
            chunks=0,
        )
    ]


async def get_document(doc_id: str) -> DocumentDetail | None:
    if doc_id != "outage-sla":
        return None
    return DocumentDetail(
        doc_id="outage-sla",
        title="Outage Credits and SLA",
        path="kb/outage-sla.md",
        trusted=True,
        chunks=0,
        content="# Outage Credits\n(stub)",
    )
