"""Business logic for the counterfactual simulator vertical slice (framework-free; ADR-0011, ADR-0013)."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any, cast

import numpy as np

from app.core.errors import AppError
from app.core.run_meta import DEFAULT_MODEL_VERSION, current_run_meta
from app.core.types import CITIES, City
from app.ports.intervention import CounterfactualForecaster
from app.ports.repositories import ObservationRepository, WardRecord
from app.ports.supply import SupplyRatioSource
from app.shared.intervention import (
    EFFICACY_PRESETS,
    SIMULATOR_HORIZONS,
    assign_crews_for_wards,
    reduction,
    roi,
)
from app.shared.optimizer import density_factors, priority_weights
from app.shared.tiers import peak_tier

from .schemas import (
    EfficacyParams,
    HorizonImpact,
    SimulatorRequest,
    SimulatorResponse,
    SimulatorTotals,
    WardImpact,
)

ASSUMPTION_NOTE = "Assumed, not fitted: no intervention labels in the data. See ADR-0013."


def _compute_priority_weights(
    wards: list[WardRecord],
    base_map: Mapping[tuple[str, int], object],
) -> dict[str, float]:
    """Compute identical per-city priority weights as AllocationService for deterministic crew tie-breaking."""
    grouped: dict[str, list[WardRecord]] = {}
    for w in wards:
        grouped.setdefault(w.city, []).append(w)

    ordered_cities = [c for c in CITIES if c in grouped] + sorted(c for c in grouped if c not in CITIES)
    weights: dict[str, float] = {}
    for city in ordered_cities:
        c_wards = sorted(grouped[city], key=lambda w: w.ward_id)
        densities = [w.population_density_sqkm for w in c_wards]
        city_median = float(np.median(densities))
        d_factors = density_factors(densities, city_median)
        tiers = [
            peak_tier([str(getattr(base_map[(w.ward_id, h)], "tier", "Low")) for h in SIMULATOR_HORIZONS])
            for w in c_wards
        ]
        p_weights = priority_weights(tiers, d_factors)
        for w, pw in zip(c_wards, p_weights, strict=True):
            weights[w.ward_id] = pw
    return weights


class SimulatorService:
    """Runs model-driven vector-control counterfactual simulations and ROI rankings."""

    def __init__(
        self,
        repo: ObservationRepository | None = None,
        forecaster: CounterfactualForecaster | None = None,
        supply_source: SupplyRatioSource | None = None,
        *,
        db_fault_hook: Callable[[], None] | None = None,
    ) -> None:
        self._repo = repo
        self._forecaster = forecaster
        self._supply_source = supply_source
        self._db_fault_hook = db_fault_hook

    def _resolve_deployments(
        self,
        req: SimulatorRequest,
        repo: ObservationRepository,
        forecaster: CounterfactualForecaster,
    ) -> tuple[list[WardRecord], dict[str, int]]:
        if req.deployments is not None:
            resolved: list[WardRecord] = []
            crews_by_ward: dict[str, int] = {}
            for dep in req.deployments:
                try:
                    rec = repo.ward(dep.ward_id)
                except Exception as exc:  # noqa: BLE001
                    raise AppError(
                        status=503,
                        slug="db-unavailable",
                        title="Database unavailable",
                        detail="Could not load ward record for simulation.",
                    ) from exc
                if rec is None:
                    raise AppError(
                        status=404,
                        slug="unknown-ward",
                        title="Unknown ward",
                        detail=f"Unknown ward_id: {dep.ward_id}",
                    )
                resolved.append(rec)
                crews_by_ward[dep.ward_id] = int(dep.crews)
            return resolved, crews_by_ward

        # auto_crews mode: run identical greedy placement as AllocationService over all wards
        assert req.auto_crews is not None
        try:
            all_wards = sorted(list(repo.wards()), key=lambda w: (w.city, w.ward_id))
        except Exception as exc:  # noqa: BLE001
            raise AppError(
                status=503,
                slug="db-unavailable",
                title="Database unavailable",
                detail="Could not load wards for auto_crews simulation.",
            ) from exc

        all_wids = [w.ward_id for w in all_wards]
        base_all = forecaster.window(all_wids, req.origin_week, SIMULATOR_HORIZONS)
        p_weights = _compute_priority_weights(all_wards, base_all)
        crew_res = assign_crews_for_wards(
            forecaster=forecaster,
            ward_ids=all_wids,
            origin_week=req.origin_week,
            horizons=SIMULATOR_HORIZONS,
            total_crews=req.auto_crews,
            weights=p_weights,
            efficacy=req.efficacy,
            cap=5,
        )
        treated_wards = [w for w in all_wards if crew_res.crews.get(w.ward_id, 0) > 0]
        crews_by_ward = {w.ward_id: int(crew_res.crews[w.ward_id]) for w in treated_wards}
        return treated_wards, crews_by_ward

    def run(self, req: SimulatorRequest) -> SimulatorResponse:
        if self._repo is None or self._forecaster is None or self._supply_source is None:
            raise NotImplementedError(
                "SimulatorService requires repo, forecaster, and supply_source dependencies"
            )

        if self._db_fault_hook is not None:
            self._db_fault_hook()

        ratios = self._supply_source.ratios()
        treated_wards, crews_by_ward = self._resolve_deployments(req, self._repo, self._forecaster)
        treated_wids = [w.ward_id for w in treated_wards]

        e_max, k = EFFICACY_PRESETS[req.efficacy]
        low_em, low_k = EFFICACY_PRESETS["low"]
        base_em, base_k = EFFICACY_PRESETS["base"]
        high_em, high_k = EFFICACY_PRESETS["high"]

        frac_low = {wid: reduction(crews_by_ward[wid], low_em, low_k) for wid in treated_wids}
        frac_base = {wid: reduction(crews_by_ward[wid], base_em, base_k) for wid in treated_wids}
        frac_high = {wid: reduction(crews_by_ward[wid], high_em, high_k) for wid in treated_wids}
        preset_index = {"low": 1, "base": 2, "high": 3}[req.efficacy]

        batch_fn = getattr(self._forecaster, "counterfactual_grid", None)
        if callable(batch_fn) and treated_wids:
            grid: list[Mapping[tuple[str, int], Any]] = cast(Any, batch_fn)(
                treated_wids,
                req.origin_week,
                SIMULATOR_HORIZONS,
                [{}, frac_low, frac_base, frac_high],
            )
            base_map, cf_low_map, cf_base_map, cf_high_map = grid[0], grid[1], grid[2], grid[3]
            cf_selected_map = grid[preset_index]
        elif treated_wids:
            base_map = self._forecaster.window(treated_wids, req.origin_week, SIMULATOR_HORIZONS)
            cf_low_map = self._forecaster.counterfactual(
                treated_wids, req.origin_week, SIMULATOR_HORIZONS, frac_low
            )
            cf_base_map = self._forecaster.counterfactual(
                treated_wids, req.origin_week, SIMULATOR_HORIZONS, frac_base
            )
            cf_high_map = self._forecaster.counterfactual(
                treated_wids, req.origin_week, SIMULATOR_HORIZONS, frac_high
            )
            cf_selected_map = {"low": cf_low_map, "base": cf_base_map, "high": cf_high_map}[req.efficacy]
        else:
            base_map = cf_low_map = cf_base_map = cf_high_map = cf_selected_map = {}

        frac_selected = {"low": frac_low, "base": frac_base, "high": frac_high}[req.efficacy]

        raw_impacts: list[WardImpact] = []
        for ward in treated_wards:
            wid = ward.ward_id
            crews = crews_by_ward[wid]
            horizon_impacts: list[HorizonImpact] = []
            prev_sel = 0.0
            prev_low = 0.0
            prev_high = 0.0

            for h in SIMULATOR_HORIZONS:
                b_val = max(0.0, float(base_map[(wid, h)].expected_cases))
                cf_sel_val = max(0.0, min(b_val, float(cf_selected_map[(wid, h)].expected_cases)))
                cf_low_val = max(0.0, min(b_val, float(cf_low_map[(wid, h)].expected_cases)))
                cf_high_val = max(0.0, min(b_val, float(cf_high_map[(wid, h)].expected_cases)))

                h_prev = max(0.0, b_val - cf_sel_val)
                prev_sel += h_prev
                prev_low += max(0.0, b_val - cf_low_val)
                prev_high += max(0.0, b_val - cf_high_val)

                horizon_impacts.append(
                    HorizonImpact(
                        horizon=h,
                        baseline_cases=round(b_val, 4),
                        counterfactual_cases=round(cf_sel_val, 4),
                        cases_prevented=round(h_prev, 4),
                    )
                )

            beds_avoided = prev_sel * ratios.hospital_beds
            saline_avoided = prev_sel * ratios.saline_bags
            roi_val = roi(prev_sel, crews)

            raw_impacts.append(
                WardImpact(
                    rank=1,
                    ward_id=wid,
                    city=cast(City, ward.city),
                    crews=crews,
                    reduction_fraction=round(frac_selected[wid], 4),
                    horizons=horizon_impacts,
                    cases_prevented=round(prev_sel, 4),
                    cases_prevented_low=round(prev_low, 4),
                    cases_prevented_high=round(prev_high, 4),
                    beds_avoided=round(beds_avoided, 4),
                    saline_avoided=round(saline_avoided, 4),
                    roi_cases_per_crew=round(roi_val, 4),
                )
            )

        raw_impacts.sort(key=lambda item: (-item.roi_cases_per_crew, -item.cases_prevented, item.ward_id))
        ranked_impacts = [
            item.model_copy(update={"rank": idx}) for idx, item in enumerate(raw_impacts, start=1)
        ]

        totals = SimulatorTotals(
            crews=sum(w.crews for w in ranked_impacts),
            cases_prevented=round(sum(w.cases_prevented for w in ranked_impacts), 4),
            cases_prevented_low=round(sum(w.cases_prevented_low for w in ranked_impacts), 4),
            cases_prevented_high=round(sum(w.cases_prevented_high for w in ranked_impacts), 4),
            beds_avoided=round(sum(w.beds_avoided for w in ranked_impacts), 4),
            saline_avoided=round(sum(w.saline_avoided for w in ranked_impacts), 4),
        )

        model = getattr(self._forecaster, "_model", None)
        model_version = getattr(model, "version", None)
        meta = current_run_meta(
            model_version=model_version if isinstance(model_version, str) else DEFAULT_MODEL_VERSION
        )

        return SimulatorResponse(
            model_version=meta.model_version,
            git_sha=meta.git_sha,
            data_as_of=meta.data_as_of,
            offline=meta.offline,
            generated_at=meta.generated_at,
            request=req,
            efficacy=EfficacyParams(
                preset=req.efficacy,
                e_max=e_max,
                k=k,
                assumption_note=ASSUMPTION_NOTE,
            ),
            wards=ranked_impacts,
            totals=totals,
        )
