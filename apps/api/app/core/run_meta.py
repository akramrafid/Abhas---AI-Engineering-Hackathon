"""Provenance envelope shared by every Phase 2 response and /readyz (contracts §1, §2.7)."""

from __future__ import annotations

import os
import re
from datetime import UTC, date, datetime
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

from app.core.config import REPO_ROOT
from app.core.offline import is_offline
from app.core.types import DATA_END

DEFAULT_MODEL_VERSION = "abhas-lgbm-1.1.2"

GIT_SHA_PATTERN = r"^([0-9a-f]{7,40}|unknown)$"
_GIT_SHA_RE = re.compile(GIT_SHA_PATTERN)
_FULL_HEX_RE = re.compile(r"^[0-9a-f]{7,40}$")

GitSha = Annotated[
    str,
    StringConstraints(pattern=GIT_SHA_PATTERN),
    Field(
        description="Commit of the running code: ABHAS_GIT_SHA, repo HEAD read once at startup, or 'unknown'",
        examples=["075e81b"],
    ),
]


def _resolve_git_dir(repo_root: Path) -> Path | None:
    dot_git = repo_root / ".git"
    if dot_git.is_dir():
        return dot_git
    if dot_git.is_file():
        try:
            first = dot_git.read_text(encoding="utf-8").strip()
        except OSError:
            return None
        if first.startswith("gitdir:"):
            target = first[len("gitdir:") :].strip()
            resolved = Path(target)
            if not resolved.is_absolute():
                resolved = (repo_root / resolved).resolve()
            return resolved if resolved.is_dir() else None
    return None


def _lookup_packed_ref(git_dir: Path, ref_name: str) -> str | None:
    packed = git_dir / "packed-refs"
    if not packed.is_file():
        commondir = git_dir / "commondir"
        if commondir.is_file():
            try:
                common_path = (git_dir / commondir.read_text(encoding="utf-8").strip()).resolve()
                packed = common_path / "packed-refs"
            except OSError:
                return None
    if not packed.is_file():
        return None
    try:
        for line in packed.read_text(encoding="utf-8").splitlines():
            if not line or line.startswith("#") or line.startswith("^"):
                continue
            parts = line.split(" ", 1)
            if len(parts) == 2 and parts[1].strip() == ref_name:
                return parts[0].strip().lower()
    except OSError:
        return None
    return None


@lru_cache(maxsize=1)
def _read_repo_git_sha() -> str:
    """Read HEAD commit hash once from .git metadata without spawning a subprocess."""
    git_dir = _resolve_git_dir(REPO_ROOT)
    if git_dir is None:
        return "unknown"
    head_file = git_dir / "HEAD"
    if not head_file.is_file():
        return "unknown"
    try:
        head_raw = head_file.read_text(encoding="utf-8").strip()
    except OSError:
        return "unknown"

    sha: str | None = None
    if head_raw.startswith("ref:"):
        ref_name = head_raw[len("ref:") :].strip()
        ref_file = git_dir / ref_name
        if not ref_file.is_file():
            commondir = git_dir / "commondir"
            if commondir.is_file():
                try:
                    common_path = (git_dir / commondir.read_text(encoding="utf-8").strip()).resolve()
                    ref_file = common_path / ref_name
                except OSError:
                    ref_file = git_dir / ref_name
        if ref_file.is_file():
            try:
                sha = ref_file.read_text(encoding="utf-8").strip().lower()
            except OSError:
                sha = None
        if sha is None:
            sha = _lookup_packed_ref(git_dir, ref_name)
    else:
        sha = head_raw.lower()

    if sha and _FULL_HEX_RE.fullmatch(sha):
        return sha[:7]
    return "unknown"


def resolve_git_sha() -> str:
    """Return ABHAS_GIT_SHA if valid, else repo HEAD short SHA (read once), else 'unknown'."""
    env_val = os.environ.get("ABHAS_GIT_SHA", "").strip().lower()
    if env_val:
        return env_val if _GIT_SHA_RE.fullmatch(env_val) else "unknown"
    return _read_repo_git_sha()


class RunMeta(BaseModel):
    """Provenance envelope inherited by every Phase 2 JSON response model."""

    model_version: str = Field(
        description="Forecast artefact version, e.g. abhas-lgbm-1.1.2",
        examples=[DEFAULT_MODEL_VERSION],
    )
    git_sha: GitSha
    data_as_of: date = Field(
        description="Last observed week used (2025-12-29 for the onsite dataset)",
        examples=[DATA_END.isoformat()],
    )
    offline: bool = Field(description="Kill switch set or network probe down (ADR-0015)")
    generated_at: datetime = Field(description="UTC timestamp when this response was generated")


def current_run_meta(
    *,
    model_version: str = DEFAULT_MODEL_VERSION,
    data_as_of: date = DATA_END,
    offline: bool | None = None,
    git_sha: str | None = None,
    generated_at: datetime | None = None,
) -> RunMeta:
    """Construct a RunMeta provenance envelope from current runtime state."""
    resolved_sha = git_sha if git_sha is not None else resolve_git_sha()
    if not _GIT_SHA_RE.fullmatch(resolved_sha):
        resolved_sha = "unknown"
    return RunMeta(
        model_version=model_version,
        git_sha=resolved_sha,
        data_as_of=data_as_of,
        offline=is_offline() if offline is None else offline,
        generated_at=generated_at if generated_at is not None else datetime.now(UTC),
    )
