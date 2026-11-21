"""Ops slice HTTP router: GET /api/v1/ops — cost, cache, latency and call counters (AC-10).

Auth: open read-only on non-production direct loopback when OPS_TOKEN is unset; X-Ops-Token must match
in production, on remote/proxied requests, or whenever OPS_TOKEN is configured (SEC-2, SEC-6).
"""

from __future__ import annotations

import hmac
import sys
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request, Response

from app.core.config import Settings, get_settings
from app.core.errors import PROBLEM_RESPONSES, AppError

from .deps import get_ops_service
from .schemas import OpsResponse
from .service import OpsService

LOCALHOST_IPS = frozenset({"127.0.0.1", "::1"})

router = APIRouter(
    prefix="/api/v1", tags=["ops"], responses={**PROBLEM_RESPONSES, 401: PROBLEM_RESPONSES[401]}
)


def _is_loopback_peer(peer: str, app_env: str) -> bool:
    if peer in LOCALHOST_IPS:
        return True
    # Starlette's in-process TestClient sends synthetic peer host "testclient" (unreachable over TCP).
    return peer == "testclient" and (app_env == "test" or "pytest" in sys.modules)


def require_ops_token(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    x_ops_token: Annotated[str | None, Header()] = None,
) -> None:
    expected = (settings.ops_token.get_secret_value() if settings.ops_token else "").strip()
    if not expected:
        peer = request.client.host if request.client else ""
        proxied = bool(request.headers.get("x-forwarded-for"))
        if settings.app_env != "production" and _is_loopback_peer(peer, settings.app_env) and not proxied:
            return
        raise AppError(401, "unauthorized", "Missing or wrong X-Ops-Token")
    if not hmac.compare_digest((x_ops_token or "").encode("utf-8"), expected.encode("utf-8")):
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
