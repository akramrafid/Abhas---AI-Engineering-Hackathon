"""Business logic for the dispatch vertical slice (framework-free; ADR-0014)."""

from __future__ import annotations

import json
from collections.abc import Callable, Mapping
from datetime import date, timedelta
from typing import Any, cast

from app.core.command_requests import AllocationRequest, PlanKind, Scope
from app.core.errors import AppError
from app.core.run_meta import DEFAULT_MODEL_VERSION, current_run_meta
from app.core.types import City, Tier
from app.ports.repositories import ObservationRepository, PlanStore, WardRecord
from app.shared.plan_registry import run as default_run_plan

from .schemas import (
    DeficitLevel,
    DispatchRequest,
    DispatchResponse,
    Lang,
    Notice,
    NoticeFacts,
    SmsMessage,
    SupplyPair,
)
from .templates import (
    render_brief_html,
    render_sms,
    render_whatsapp,
    tier_action_text,
    ward_display_name,
)

PlanRunnerFn = Callable[[PlanKind, Any], tuple[dict[str, Any], dict[str, Any]]]

_VALID_TIERS: frozenset[str] = frozenset({"Low", "Medium", "High", "Critical"})
_VALID_DEFICITS: frozenset[str] = frozenset({"none", "deficit", "critical"})


def _classify_deficit_fallback(
    saline: SupplyPair,
    kits: SupplyPair,
    beds: SupplyPair,
    tier: Tier,
) -> DeficitLevel:
    pairs = (saline, kits, beds)
    has_any_deficit = any(p.allocated < p.required for p in pairs)
    if not has_any_deficit:
        return "none"
    if tier in ("High", "Critical"):
        return "critical"
    for p in pairs:
        if p.required > 0 and (p.allocated / p.required) < 0.5:
            return "critical"
    return "deficit"


def _row_to_facts(
    *,
    ward: WardRecord,
    row: Mapping[str, Any],
    window_start: date,
    window_end: date,
    lang: Lang,
) -> NoticeFacts:
    raw_tier = str(row.get("tier", "Low"))
    tier: Tier = cast(Tier, raw_tier if raw_tier in _VALID_TIERS else "Low")

    expected_cases = round(max(0.0, float(row.get("expected_cases", 0.0))), 1)

    def _pair(key: str) -> SupplyPair:
        raw = row.get(key)
        if isinstance(raw, Mapping):
            req_v = max(0, int(raw.get("required", 0)))
            alloc_v = max(0, min(req_v, int(raw.get("allocated", 0))))
            return SupplyPair(required=req_v, allocated=alloc_v)
        return SupplyPair(required=0, allocated=0)

    saline = _pair("saline_bags")
    kits = _pair("diagnostic_kits")
    beds = _pair("hospital_beds")
    crews = max(0, int(row.get("crews", 0)))

    raw_def = str(row.get("deficit_level", ""))
    deficit_level: DeficitLevel = (
        cast(DeficitLevel, raw_def)
        if raw_def in _VALID_DEFICITS
        else _classify_deficit_fallback(saline, kits, beds, tier)
    )

    return NoticeFacts(
        ward_id=ward.ward_id,
        ward_name=ward_display_name(ward.ward_id),
        city=cast(City, ward.city),
        window_start=window_start,
        window_end=window_end,
        tier=tier,
        predicted_cases=expected_cases,
        saline_bags=saline,
        diagnostic_kits=kits,
        hospital_beds=beds,
        crews_assigned=crews,
        deficit_level=deficit_level,
        action=tier_action_text(tier, deficit_level, lang),
    )


def _fallback_row_for_ward(
    ward: WardRecord,
    *,
    template_row: Mapping[str, Any] | None,
    stock_pct: int,
    total_crews: int,
    ward_index: int,
) -> dict[str, Any]:
    """Deterministic fallback when allocation runner is still a single-ward WP0 stub."""
    density_scale = max(0.35, min(1.35, float(ward.population_density_sqkm) / 45000.0))
    base_cases = float(template_row.get("expected_cases", 24.0)) if template_row else 24.0
    expected_cases = round(max(1.0, base_cases * density_scale), 1)

    if template_row and isinstance(template_row.get("saline_bags"), Mapping):
        base_sal = int(template_row["saline_bags"].get("required", 60))
        base_kit = int(template_row["diagnostic_kits"].get("required", 30))
        base_bed = int(template_row["hospital_beds"].get("required", 8))
    else:
        base_sal, base_kit, base_bed = 60, 30, 8

    sal_req = max(1, round(base_sal * density_scale))
    kit_req = max(1, round(base_kit * density_scale))
    bed_req = max(1, round(base_bed * density_scale))

    ratio = stock_pct / 100.0
    sal_alloc = min(sal_req, round(sal_req * ratio))
    kit_alloc = min(kit_req, round(kit_req * ratio))
    bed_alloc = min(bed_req, round(bed_req * ratio))

    if expected_cases >= 42.0:
        tier: Tier = "Critical"
    elif expected_cases >= 24.0:
        tier = "High"
    elif expected_cases >= 10.0:
        tier = "Medium"
    else:
        tier = "Low"

    crews = 1 if (total_crews > 0 and ward_index < total_crews) else 0
    deficit_level = _classify_deficit_fallback(
        SupplyPair(required=sal_req, allocated=sal_alloc),
        SupplyPair(required=kit_req, allocated=kit_alloc),
        SupplyPair(required=bed_req, allocated=bed_alloc),
        tier,
    )
    return {
        "ward_id": ward.ward_id,
        "city": ward.city,
        "tier": tier,
        "expected_cases": expected_cases,
        "saline_bags": {"required": sal_req, "allocated": sal_alloc},
        "diagnostic_kits": {"required": kit_req, "allocated": kit_alloc},
        "hospital_beds": {"required": bed_req, "allocated": bed_alloc},
        "crews": crews,
        "deficit_level": deficit_level,
    }


def _build_brief_url(
    *,
    ward_id: str,
    origin_week: date,
    lang: Lang,
    stock_pct: int,
    total_crews: int,
    plan_id: str | None,
) -> str:
    url = (
        f"/api/v1/dispatch/brief/{ward_id}.html"
        f"?origin_week={origin_week.isoformat()}&lang={lang}"
        f"&stock_pct={stock_pct}&total_crews={total_crews}"
    )
    if plan_id is not None:
        url += f"&plan_id={plan_id}"
    return url


class DispatchService:
    """Renders deterministic multi-channel operational notices and A4 HTML briefs (ADR-0014)."""

    def __init__(
        self,
        repo: ObservationRepository | None = None,
        plan_store: PlanStore | None = None,
        allocation_runner: PlanRunnerFn | None = None,
    ) -> None:
        self._repo = repo
        self._plan_store = plan_store
        self._allocation_runner: PlanRunnerFn = allocation_runner or default_run_plan

    def _require_repo(self) -> ObservationRepository:
        if self._repo is None:
            raise NotImplementedError("DispatchService requires a configured ObservationRepository")
        return self._repo

    def _resolve_allocation(
        self,
        *,
        origin_week: date,
        scope: Scope,
        plan_id: str | None,
        stock_pct: int,
        total_crews: int,
    ) -> tuple[dict[str, Mapping[str, Any]], Mapping[str, Any] | None, date, date, str, int, int]:
        """Load allocation rows either from a saved allocation plan or via shared.plan_registry."""
        if plan_id is not None:
            if self._plan_store is None:
                raise AppError(404, "unknown-plan", "Unknown plan", f"Plan {plan_id} was not found")
            stored = self._plan_store.get(plan_id)
            if stored is None:
                raise AppError(404, "unknown-plan", "Unknown plan", f"Plan {plan_id} was not found")
            if stored.kind != "allocation":
                raise AppError(
                    422,
                    "validation-error",
                    "Invalid plan kind",
                    f"Plan {plan_id} has kind {stored.kind!r}; dispatch requires an 'allocation' plan",
                )
            outputs = json.loads(stored.outputs_json)
            inputs = json.loads(stored.inputs_json)
            plan_origin = stored.origin_week
            h_start = int(inputs.get("h_start", 2))
            h_end = int(inputs.get("h_end", 4))
            eff_stock = int(inputs.get("stock_pct", stock_pct))
            eff_crews = int(inputs.get("total_crews", total_crews))
            model_version = stored.model_version or DEFAULT_MODEL_VERSION
        else:
            alloc_req = AllocationRequest(
                scope=scope,
                origin_week=origin_week,
                h_start=2,
                h_end=4,
                stock_pct=stock_pct,
                total_crews=total_crews,
            )
            outputs, _headline = self._allocation_runner("allocation", alloc_req)
            req_echo = outputs.get("request") if isinstance(outputs, Mapping) else None
            h_start = int(req_echo.get("h_start", 2)) if isinstance(req_echo, Mapping) else 2
            h_end = int(req_echo.get("h_end", 4)) if isinstance(req_echo, Mapping) else 4
            plan_origin = origin_week
            eff_stock = stock_pct
            eff_crews = total_crews
            raw_mv = outputs.get("model_version") if isinstance(outputs, Mapping) else None
            model_version = raw_mv if isinstance(raw_mv, str) and raw_mv.strip() else DEFAULT_MODEL_VERSION

        raw_wards = outputs.get("wards", []) if isinstance(outputs, Mapping) else []
        by_id: dict[str, Mapping[str, Any]] = {}
        first_row: Mapping[str, Any] | None = None
        for entry in raw_wards:
            if isinstance(entry, Mapping) and "ward_id" in entry:
                wid = str(entry["ward_id"])
                by_id[wid] = entry
                if first_row is None:
                    first_row = entry

        window_start = plan_origin + timedelta(weeks=h_start)
        window_end = plan_origin + timedelta(weeks=h_end)
        return by_id, first_row, window_start, window_end, model_version, eff_stock, eff_crews

    def _resolve_target_wards(self, repo: ObservationRepository, req: DispatchRequest) -> list[WardRecord]:
        if req.ward_ids is not None:
            resolved: list[WardRecord] = []
            for wid in req.ward_ids:
                rec = repo.ward(wid)
                if rec is None:
                    raise AppError(404, "unknown-ward", "Unknown ward", f"No ward with id {wid}")
                resolved.append(rec)
            return resolved

        city_filter = None if req.scope == "all" else req.scope
        return list(repo.wards(city=city_filter))

    def notices(self, req: DispatchRequest) -> DispatchResponse:
        repo = self._require_repo()
        target_wards = self._resolve_target_wards(repo, req)

        if req.scope is not None:
            alloc_scope: Scope = req.scope
        else:
            cities = {w.city for w in target_wards}
            alloc_scope = cast(Scope, next(iter(cities))) if len(cities) == 1 else "all"

        (
            alloc_by_id,
            template_row,
            window_start,
            window_end,
            model_version,
            eff_stock,
            eff_crews,
        ) = self._resolve_allocation(
            origin_week=req.origin_week,
            scope=alloc_scope,
            plan_id=req.plan_id,
            stock_pct=req.stock_pct,
            total_crews=req.total_crews,
        )

        # For scope requests, preserve allocation priority order for matched wards, then remaining wards.
        if req.scope is not None:
            ward_lookup = {w.ward_id: w for w in target_wards}
            ordered_wards: list[WardRecord] = []
            seen: set[str] = set()
            for wid in alloc_by_id:
                if wid in ward_lookup and wid not in seen:
                    ordered_wards.append(ward_lookup[wid])
                    seen.add(wid)
            for w in sorted(target_wards, key=lambda item: (item.city, item.ward_id)):
                if w.ward_id not in seen:
                    ordered_wards.append(w)
                    seen.add(w.ward_id)
        else:
            ordered_wards = target_wards

        channels = set(req.channels)
        notices_out: list[Notice] = []
        for idx, ward in enumerate(ordered_wards):
            row = alloc_by_id.get(ward.ward_id)
            if row is None:
                row = _fallback_row_for_ward(
                    ward,
                    template_row=template_row,
                    stock_pct=eff_stock,
                    total_crews=eff_crews,
                    ward_index=idx,
                )
            facts = _row_to_facts(
                ward=ward,
                row=row,
                window_start=window_start,
                window_end=window_end,
                lang=req.lang,
            )
            sms_msg: SmsMessage | None = render_sms(facts, req.lang) if "sms" in channels else None
            wa_msg: str | None = render_whatsapp(facts, req.lang) if "whatsapp" in channels else None
            brief_url: str | None = (
                _build_brief_url(
                    ward_id=ward.ward_id,
                    origin_week=req.origin_week,
                    lang=req.lang,
                    stock_pct=req.stock_pct,
                    total_crews=req.total_crews,
                    plan_id=req.plan_id,
                )
                if "brief" in channels
                else None
            )
            notices_out.append(Notice(facts=facts, sms=sms_msg, whatsapp=wa_msg, brief_url=brief_url))

        meta = current_run_meta(model_version=model_version)
        return DispatchResponse(
            model_version=meta.model_version,
            git_sha=meta.git_sha,
            data_as_of=meta.data_as_of,
            offline=meta.offline,
            generated_at=meta.generated_at,
            request=req,
            lang=req.lang,
            notices=notices_out,
        )

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
        repo = self._require_repo()
        ward = repo.ward(ward_id)
        if ward is None:
            raise AppError(404, "unknown-ward", "Unknown ward", f"No ward with id {ward_id}")

        (
            alloc_by_id,
            template_row,
            window_start,
            window_end,
            model_version,
            eff_stock,
            eff_crews,
        ) = self._resolve_allocation(
            origin_week=origin_week,
            scope=cast(Scope, ward.city),
            plan_id=plan_id,
            stock_pct=stock_pct,
            total_crews=total_crews,
        )

        row = alloc_by_id.get(ward.ward_id)
        if row is None:
            row = _fallback_row_for_ward(
                ward,
                template_row=template_row,
                stock_pct=eff_stock,
                total_crews=eff_crews,
                ward_index=0,
            )

        facts = _row_to_facts(
            ward=ward,
            row=row,
            window_start=window_start,
            window_end=window_end,
            lang=lang,
        )
        meta = current_run_meta(model_version=model_version)
        return render_brief_html(
            facts,
            meta=meta,
            lang=lang,
            origin_week=origin_week,
            plan_id=plan_id,
            stock_pct=eff_stock,
            total_crews=eff_crews,
        )
