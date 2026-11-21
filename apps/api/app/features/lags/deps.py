"""Dependency wiring for the lags vertical slice."""

from __future__ import annotations

from threading import RLock

from app.adapters.db.factory import get_observation_repository

from .service import LagsService

_lock = RLock()
_service: LagsService | None = None
_repo_id: int | None = None


def get_lags_service() -> LagsService:
    global _service, _repo_id
    repo = get_observation_repository()
    with _lock:
        if _service is None or _repo_id != id(repo):
            _service = LagsService(repo)
            _repo_id = id(repo)
        return _service
