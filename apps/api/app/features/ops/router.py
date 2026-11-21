"""Ops slice HTTP router: GET /api/v1/ops — cost, cache, latency and call counters (AC-10).

Auth: open read-only on localhost when OPS_TOKEN is unset; X-Ops-Token must match when set.
"""

from __future__ import annotations

import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Response

from app.core.config import Settings, get_settings
from app.core.errors import PROBLEM_RESPONSES, AppError

from .deps import get_ops_service
from .schemas import OpsResponse
from .service import OpsService

router = APIRouter(
    prefix="/api/v1", tags=["ops"], responses={**PROBLEM_RESPONSES, 401: PROBLEM_RESPONSES[401]}
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
def ops(
    response: Response,
    svc: OpsService = Depends(get_ops_service),
) -> OpsResponse:
    response.headers["Cache-Control"] = "no-store"
    return svc.snapshot()
