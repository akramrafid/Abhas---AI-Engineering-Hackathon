"""Framework-free service for the planning vertical slice (ADR-0021)."""

from __future__ import annotations

from app.core.run_meta import current_run_meta
from app.core.types import City
from app.ports.planning import StructuralPlannerSource
from app.shared.structural import STRUCTURAL_DISCLAIMER

from .schemas import StructuralPlannerResponse


class PlanningService:
    """Serves precomputed structural-fix estimates and Build-vs-Send comparisons offline."""

    def __init__(self, source: StructuralPlannerSource) -> None:
        self._source = source

    def get_structural(self, *, city: City | None = None) -> StructuralPlannerResponse:
        raw = self._source.load_structural()
        wards = list(raw.get("wards") or [])
        if city is not None:
            wards = [w for w in wards if str(w.get("city")) == city]

        meta = current_run_meta(
            model_version=str(raw.get("model_version") or "abhas-lgbm-1.1.2"),
            git_sha=str(raw.get("git_sha") or "unknown"),
        )
        payload = {
            **raw,
            "model_version": meta.model_version,
            "git_sha": meta.git_sha,
            "data_as_of": raw.get("data_as_of") or meta.data_as_of,
            "offline": meta.offline,
            "generated_at": raw.get("generated_at") or meta.generated_at,
            "disclaimer": STRUCTURAL_DISCLAIMER,
            "city_filter": city,
            "wards": wards,
        }
        return StructuralPlannerResponse.model_validate(payload)
