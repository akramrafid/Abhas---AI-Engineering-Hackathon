"""STUB router (LEAD skeleton): schema-valid sample data. CORE replaces it (template first, LLM via port)."""

from fastapi import APIRouter

from app.core.errors import PROBLEM_RESPONSES

from .schemas import AdvisoryAction, AdvisoryRequest, AdvisoryResponse

router = APIRouter(prefix="/api/v1", tags=["advisory"], responses=PROBLEM_RESPONSES)


@router.post("/advisory", response_model=AdvisoryResponse, summary="Short officer advisory for one ward")
def advisory(req: AdvisoryRequest) -> AdvisoryResponse:
    return AdvisoryResponse(
        ward_id=req.ward_id,
        origin_week=req.origin_week,
        horizon=req.horizon,
        language=req.language,
        tier="High",
        headline=f"{req.ward_id}: High risk expected in {req.horizon} weeks",
        summary="Template advisory (stub).",
        actions=[AdvisoryAction(action="Larvicide drains and containers", when="this week")],
        source="template",
        model=None,
        cached=False,
        numbers_validated=True,
    )
