from fastapi import APIRouter, Query

from app.schemas import BatchTriageResult, ErrorResponse, TriageHistoryItem, TriageRequest, TriageResult
from app.services import triage as svc

router = APIRouter(prefix="/triage", tags=["triage"])


@router.post(
    "", response_model=TriageResult, responses={422: {"model": ErrorResponse}, 503: {"model": ErrorResponse}}
)
async def triage(req: TriageRequest) -> TriageResult:
    """Always returns a schema-valid TriageResult or an ErrorResponse, never free text."""
    return await svc.triage(req)


@router.post("/batch", response_model=BatchTriageResult)
async def triage_batch() -> BatchTriageResult:
    """Triage every labelled sample ticket and report accuracy against the labels."""
    return await svc.triage_batch()


@router.get("/history", response_model=list[TriageHistoryItem])
async def history(limit: int = Query(default=50, ge=1, le=200)) -> list[TriageHistoryItem]:
    return await svc.history(limit)
