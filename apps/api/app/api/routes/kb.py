from fastapi import APIRouter

from app.core.errors import AppError
from app.schemas import DocumentDetail, DocumentSummary, ErrorResponse, IndexResult
from app.services import kb

router = APIRouter(prefix="/kb", tags=["kb"])


@router.post("/index", response_model=IndexResult)
async def index() -> IndexResult:
    """(Re)index every file in data/kb. Idempotent: unchanged chunks skipped, stale ones deleted."""
    return await kb.index_kb()


@router.get("/documents", response_model=list[DocumentSummary])
async def documents() -> list[DocumentSummary]:
    return await kb.list_documents()


@router.get("/documents/{doc_id}", response_model=DocumentDetail, responses={404: {"model": ErrorResponse}})
async def document(doc_id: str) -> DocumentDetail:
    doc = await kb.get_document(doc_id)
    if doc is None:
        raise AppError("not_found", "Document not found", 404)
    return doc
