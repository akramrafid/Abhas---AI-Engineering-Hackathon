"""Business logic for the dispatch vertical slice (framework-free; implemented in WP4)."""

from __future__ import annotations

from datetime import date

from .schemas import DispatchRequest, DispatchResponse, Lang


class DispatchService:
    """Renders deterministic multi-channel operational notices and A4 HTML briefs (ADR-0014)."""

    def notices(self, req: DispatchRequest) -> DispatchResponse:
        raise NotImplementedError("Implemented in WP4 (deterministic dispatch templates)")

    def brief_html(
        self,
        *,
        ward_id: str,
        origin_week: date,
        lang: Lang = "en",
        plan_id: str | None = None,
        stock_pct: int = 100,
        total_crews: int = 0,
    ) -> str:
        raise NotImplementedError("Implemented in WP4 (printable commissioner brief)")
