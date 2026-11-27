"""Offline JSON adapters for ADR-0020 trigger.json and ADR-0021 structural.json.

Zero network calls; SHA-256 validated against the locked onsite dataset; cached in memory
by mtime so repeated GET requests respond in < 1 ms.
"""

from __future__ import annotations

import hmac
import json
from pathlib import Path
from threading import RLock
from typing import Any

from app.core.config import API_DIR
from app.core.errors import AppError

EXPECTED_ONSITE_SHA256 = "24fac5430af369142fcb3b1f0bd1fb99ca4583c618f83336d5dee58a5ebef9b0"
DEFAULT_TRIGGER_PATH = API_DIR / "evals" / "results" / "trigger.json"
DEFAULT_STRUCTURAL_PATH = API_DIR / "evals" / "results" / "structural.json"

_lock = RLock()
_cache: dict[Path, tuple[float, dict[str, Any]]] = {}


class PlanningArtifactUnavailableError(AppError):
    """Raised when a precomputed trigger or structural JSON artefact is missing or invalid."""

    def __init__(self, title: str, detail: str) -> None:
        super().__init__(status=503, slug="not-ready", title=title, detail=detail)


def _load_validated_json(
    path: Path,
    *,
    label: str,
    expected_sha256: str = EXPECTED_ONSITE_SHA256,
) -> dict[str, Any]:
    with _lock:
        if not path.exists():
            raise PlanningArtifactUnavailableError(
                f"{label} unavailable",
                f"Precomputed artefact missing at {path.name}; run npm run trigger / npm run structural.",
            )
        mtime = path.stat().st_mtime
        cached = _cache.get(path)
        if cached is not None and cached[0] == mtime:
            return cached[1]

        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise PlanningArtifactUnavailableError(
                f"{label} unreadable",
                f"Could not parse {path.name}: {exc}",
            ) from exc

        if not isinstance(raw, dict):
            raise PlanningArtifactUnavailableError(
                f"{label} invalid",
                f"{path.name} root must be a JSON object.",
            )

        sha = str(raw.get("dataset_sha256") or "").strip().lower()
        if len(sha) != 64 or not hmac.compare_digest(sha, expected_sha256.strip().lower()):
            raise PlanningArtifactUnavailableError(
                f"{label} stale",
                f"{path.name} dataset_sha256 does not match the locked onsite dataset.",
            )

        _cache[path] = (mtime, raw)
        return raw


class FileTriggerEvaluationSource:
    """Adapter serving apps/api/evals/results/trigger.json."""

    def __init__(self, path: Path = DEFAULT_TRIGGER_PATH) -> None:
        self._path = path

    def load_trigger(self) -> dict[str, Any]:
        return _load_validated_json(self._path, label="Trigger evaluation")


class FileStructuralPlannerSource:
    """Adapter serving apps/api/evals/results/structural.json."""

    def __init__(self, path: Path = DEFAULT_STRUCTURAL_PATH) -> None:
        self._path = path

    def load_structural(self) -> dict[str, Any]:
        return _load_validated_json(self._path, label="Structural-fix planner")


def get_trigger_evaluation_source() -> FileTriggerEvaluationSource:
    return FileTriggerEvaluationSource()


def get_structural_planner_source() -> FileStructuralPlannerSource:
    return FileStructuralPlannerSource()


def check_trigger_evaluation_ready() -> bool:
    try:
        data = get_trigger_evaluation_source().load_trigger()
        return isinstance(data.get("rule"), dict) and isinstance(data.get("holdout_rule"), dict)
    except Exception:  # noqa: BLE001
        return False


def check_structural_planner_ready() -> bool:
    try:
        data = get_structural_planner_source().load_structural()
        return isinstance(data.get("wards"), list) and len(data["wards"]) > 0
    except Exception:  # noqa: BLE001
        return False


def reset_planning_cache() -> None:
    with _lock:
        _cache.clear()
