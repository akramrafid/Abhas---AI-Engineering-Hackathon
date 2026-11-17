from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthz() -> dict:
    return {"status": "ok"}


@router.get("/readyz")
async def readyz() -> dict:
    s = get_settings()
    return {
        "status": "ok",
        "llm": "configured" if s.llm_enabled else "mock",
        "kb_dir_exists": s.kb_dir.exists(),
    }
