"""STUB router (LEAD skeleton): schema-valid sample data. CORE replaces it with real counters (role 15).

Auth: open on localhost when OPS_TOKEN is unset; X-Ops-Token must match when it is set.
"""

import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, Header

from app.core.config import Settings, get_settings
from app.core.errors import PROBLEM_RESPONSES, AppError

from .schemas import CallStats, LLMStats, OpsResponse, PredictionStats

router = APIRouter(
    prefix="/api/v1", tags=["ops"], responses={**PROBLEM_RESPONSES, 401: PROBLEM_RESPONSES[404]}
)


def require_ops_token(
    settings: Annotated[Settings, Depends(get_settings)],
    x_ops_token: Annotated[str | None, Header()] = None,
) -> None:
    expected = settings.ops_token.get_secret_value() if settings.ops_token else ""
    if expected and not hmac.compare_digest(x_ops_token or "", expected):
        raise AppError(401, "unauthorized", "Missing or wrong X-Ops-Token")


@router.get(
    "/ops",
    response_model=OpsResponse,
    summary="Cost, cache and call counters",
    dependencies=[Depends(require_ops_token)],
)
def ops() -> OpsResponse:
    zero = CallStats(calls_today=0, calls_total=0, cache_hits=0, errors=0)
    return OpsResponse(
        model_version="stub-0",
        model_loads=1,
        uptime_s=0.0,
        predictions=PredictionStats(requests=0, cache_hits=0, cache_hit_rate=0.0, p50_ms=0.0, p95_ms=0.0),
        weather=zero,
        llm=LLMStats(**zero.model_dump(), spend_usd_today=0.0, budget_usd_per_day=1.0, enabled=False),
        est_monthly_cost_usd=0.0,
    )
