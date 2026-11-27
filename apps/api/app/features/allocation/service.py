"""Business logic for the allocation vertical slice (framework-free; WP1 + WP3 crew hook)."""

from __future__ import annotations

import time
from collections.abc import Callable, Mapping, Sequence
from datetime import date
from typing import Any, cast

import numpy as np

from app.core.errors import AppError
from app.core.run_meta import current_run_meta
from app.core.types import CITIES, City, Tier
from app.ports.repositories import ObservationRepository, WardRecord
from app.ports.supply import SupplyRatioSource
from app.shared.forecast_engine import ForecastEngine
from app.shared.optimizer import (
    CrewAssignmentResult,
    InfeasibleAllocationError,
    allocate_city,
    available_stock,
    classify_deficit,
    density_factors,
    priority_weights,
)
from app.shared.supply import supply_for_cases, window_case_quantile

from .schemas import (
    AllocationRequest,
    AllocationResponse,
    CityAllocationSummary,
    CityResourceTotals,
    CrewMethod,
    ResourceKey,
    ResourceLine,
    WardAllocation,
)

DEFAULT_SALINE_SERVICE_LEVEL = 0.8
DEFAULT_BEDS_SERVICE_LEVEL = 0.9
_DEFAULT_NB_R = 5.0
_RESOURCE_KEYS: tuple[ResourceKey, ...] = ("saline_bags", "diagnostic_kits", "hospital_beds")

CrewAssigner = Callable[
    [Sequence[WardRecord], date, Sequence[int], int, Mapping[str, float]],
    CrewAssignmentResult,
]


def _make_resource_line(required: int, allocated: int) -> ResourceLine:
    deficit = required - allocated
    fulfilment_pct = 100.0 if required == 0 else round((allocated / required) * 100.0, 2)
    fulfilment_pct = max(0.0, min(100.0, fulfilment_pct))
    return ResourceLine(
        required=required,
        allocated=allocated,
        deficit=deficit,
        fulfilment_pct=fulfilment_pct,
    )


class AllocationService:
    """Computes constrained regional supply allocations and optional greedy crew assignments."""

    def __init__(
        self,
        repo: ObservationRepository | None = None,
        engine: ForecastEngine | None = None,
        supply_source: SupplyRatioSource | None = None,
        *,
        crew_assigner: CrewAssigner | None = None,
        db_fault_hook: Callable[[], None] | None = None,
        nb_r_by_horizon: Mapping[int, float] | None = None,
    ) -> None:
        self._repo = repo
        self._engine = engine
        self._supply_source = supply_source
        self._crew_assigner = crew_assigner
        self._db_fault_hook = db_fault_hook
        self._nb_r_by_horizon = dict(nb_r_by_horizon) if nb_r_by_horizon is not None else None

    def _nb_r_for_horizon(self, engine: ForecastEngine, horizon: int) -> float:
        if self._nb_r_by_horizon is not None and horizon in self._nb_r_by_horizon:
            return float(self._nb_r_by_horizon[horizon])

        nb_size_fn = getattr(engine, "nb_size", None)
        if callable(nb_size_fn):
            return float(cast(Any, nb_size_fn)(horizon))

        model = getattr(engine, "_model", None)
        calibrations = getattr(model, "calibrations", None)
        if isinstance(calibrations, Mapping):
            cal = calibrations.get(horizon)
            if cal is not None and hasattr(cal, "nb_r"):
                return float(cal.nb_r)

        return _DEFAULT_NB_R

    def _load_wards_by_city(
        self, repo: ObservationRepository, scope: str
    ) -> tuple[list[City], dict[City, list[WardRecord]]]:
        if self._db_fault_hook is not None:
            self._db_fault_hook()
        try:
            if scope == "all":
                raw_wards = list(repo.wards())
            else:
                raw_wards = list(repo.wards(city=scope))
        except Exception as exc:  # noqa: BLE001
            raise AppError(
                status=503,
                slug="db-unavailable",
                title="Database unavailable",
                detail="Could not load wards for allocation.",
            ) from exc

        if not raw_wards:
            raise AppError(
                status=404,
                slug="unknown-city",
                title="Unknown city",
                detail=f"No wards found for scope {scope!r}.",
            )

        target_cities: list[City] = [cast(City, c) for c in CITIES] if scope == "all" else [cast(City, scope)]
        grouped: dict[City, list[WardRecord]] = {}
        for city in target_cities:
            city_wards = sorted(
                (w for w in raw_wards if w.city == city),
                key=lambda w: w.ward_id,
            )
            if city_wards:
                grouped[city] = city_wards

        if not grouped:
            raise AppError(
                status=404,
                slug="unknown-city",
                title="Unknown city",
                detail=f"No wards found for scope {scope!r}.",
            )
        active_cities = sorted(grouped.keys())
        return active_cities, grouped

    def plan(self, req: AllocationRequest) -> AllocationResponse:
        if self._repo is None or self._engine is None or self._supply_source is None:
            raise NotImplementedError(
                "AllocationService requires repo, engine, and supply_source dependencies"
            )

        t0 = time.perf_counter()
        self._engine.validate_origin(req.origin_week, source="dataset")
        ratios = self._supply_source.ratios()
        active_cities, wards_by_city = self._load_wards_by_city(self._repo, req.scope)

        horizons = list(range(req.h_start, req.h_end + 1))
        nb_r_vec = [self._nb_r_for_horizon(self._engine, h) for h in horizons]

        saline_level = req.service_level if req.service_level is not None else DEFAULT_SALINE_SERVICE_LEVEL
        kits_level = saline_level
        beds_level = req.service_level if req.service_level is not None else DEFAULT_BEDS_SERVICE_LEVEL

        all_wards: list[WardRecord] = [w for city in active_cities for w in wards_by_city[city]]
        batch = self._engine.forecast(
            ward_ids=[w.ward_id for w in all_wards],
            origin_week=req.origin_week,
            horizons=horizons,
            source="dataset",
        )
        fc_by_ward = {wf.ward_id: wf for wf in batch.forecasts}

        # Stage 1: per-city demand sizing, priority weights, and independent per-resource LP solves
        city_ward_data: dict[City, list[dict[str, object]]] = {}
        city_resource_totals: dict[City, list[CityResourceTotals]] = {}
        priority_weight_by_ward: dict[str, float] = {}

        for city in active_cities:
            c_wards = wards_by_city[city]
            c_ward_ids = [w.ward_id for w in c_wards]
            densities = [w.population_density_sqkm for w in c_wards]
            city_median = float(np.median(densities))
            d_factors = density_factors(densities, city_median)

            tiers: list[str] = []
            expected_vec: list[float] = []
            planned_primary_vec: list[int] = []
            req_by_resource: dict[ResourceKey, list[int]] = {
                "saline_bags": [],
                "diagnostic_kits": [],
                "hospital_beds": [],
            }

            for w in c_wards:
                wf = fc_by_ward[w.ward_id]
                means = [hf.expected_cases for hf in wf.horizons]
                tiers.append(wf.peak_tier)
                expected_vec.append(sum(means))

                q_primary = window_case_quantile(means, nb_r_vec, saline_level)
                q_beds = (
                    q_primary
                    if beds_level == saline_level
                    else window_case_quantile(means, nb_r_vec, beds_level)
                )
                primary_supplies = supply_for_cases(q_primary, ratios)
                beds_supplies = primary_supplies if q_beds == q_primary else supply_for_cases(q_beds, ratios)

                planned_primary_vec.append(q_primary)
                req_by_resource["saline_bags"].append(primary_supplies["saline_bags"])
                req_by_resource["diagnostic_kits"].append(primary_supplies["diagnostic_kits"])
                req_by_resource["hospital_beds"].append(beds_supplies["hospital_beds"])

            p_weights = priority_weights(tiers, d_factors)
            for wid, pw in zip(c_ward_ids, p_weights, strict=True):
                priority_weight_by_ward[wid] = pw

            alloc_by_resource: dict[ResourceKey, list[int]] = {}
            totals_list: list[CityResourceTotals] = []
            for resource in _RESOURCE_KEYS:
                demand_vec = req_by_resource[resource]
                try:
                    lp_res = allocate_city(
                        demand=demand_vec,
                        weights=p_weights,
                        stock_pct=req.stock_pct,
                        floor_pct=req.equity_floor_pct,
                        ward_ids=c_ward_ids,
                    )
                except InfeasibleAllocationError as exc:
                    raise AppError(
                        status=409,
                        slug="infeasible",
                        title="Allocation infeasible",
                        detail=str(exc),
                    ) from exc

                alloc_by_resource[resource] = lp_res.allocated
                req_total = sum(demand_vec)
                avail_total = available_stock(req_total, req.stock_pct)
                alloc_total = sum(lp_res.allocated)
                totals_list.append(
                    CityResourceTotals(
                        resource=resource,
                        required=req_total,
                        available=avail_total,
                        allocated=alloc_total,
                        floors_scaled=lp_res.floors_scaled,
                    )
                )

            city_resource_totals[city] = totals_list
            rows_for_city: list[dict[str, object]] = []
            for idx, w in enumerate(c_wards):
                rows_for_city.append(
                    {
                        "ward_id": w.ward_id,
                        "city": city,
                        "tier": cast(Tier, tiers[idx]),
                        "expected_cases": round(expected_vec[idx], 4),
                        "planned_cases": float(planned_primary_vec[idx]),
                        "density_factor": round(d_factors[idx], 4),
                        "priority_weight": round(p_weights[idx], 4),
                        "req_map": {r: req_by_resource[r][idx] for r in _RESOURCE_KEYS},
                        "alloc_map": {r: alloc_by_resource[r][idx] for r in _RESOURCE_KEYS},
                    }
                )
            city_ward_data[city] = rows_for_city

        # Stage 2: optional WP3 crew assignment hook (defaults to 0 crews in WP1)
        crews_by_ward: Mapping[str, int] = {}
        crew_method: CrewMethod = "greedy"
        if self._crew_assigner is not None and req.total_crews > 0:
            crew_res = self._crew_assigner(
                all_wards,
                req.origin_week,
                horizons,
                req.total_crews,
                priority_weight_by_ward,
            )
            crews_by_ward = crew_res.crews
            crew_method = "greedy (approximate)" if crew_res.approximate else "greedy"

        # Stage 3: build WardAllocation rows + CityAllocationSummary records
        all_ward_allocs: list[WardAllocation] = []
        city_summaries: list[CityAllocationSummary] = []

        for city in active_cities:
            city_allocs: list[WardAllocation] = []
            for row in city_ward_data[city]:
                wid = cast(str, row["ward_id"])
                tier = cast(Tier, row["tier"])
                req_map = cast(dict[ResourceKey, int], row["req_map"])
                alloc_map = cast(dict[ResourceKey, int], row["alloc_map"])

                deficit_level, deficit_reasons = classify_deficit(
                    cast(Mapping[str, int], req_map),
                    cast(Mapping[str, int], alloc_map),
                    tier,
                )
                wa = WardAllocation(
                    ward_id=wid,
                    city=city,
                    tier=tier,
                    expected_cases=cast(float, row["expected_cases"]),
                    planned_cases=cast(float, row["planned_cases"]),
                    density_factor=cast(float, row["density_factor"]),
                    priority_weight=cast(float, row["priority_weight"]),
                    saline_bags=_make_resource_line(req_map["saline_bags"], alloc_map["saline_bags"]),
                    diagnostic_kits=_make_resource_line(
                        req_map["diagnostic_kits"], alloc_map["diagnostic_kits"]
                    ),
                    hospital_beds=_make_resource_line(req_map["hospital_beds"], alloc_map["hospital_beds"]),
                    crews=int(crews_by_ward.get(wid, 0)),
                    deficit_level=deficit_level,
                    deficit_reasons=deficit_reasons,
                )
                city_allocs.append(wa)

            city_allocs.sort(key=lambda w: (-w.priority_weight, w.ward_id))
            all_ward_allocs.extend(city_allocs)

            city_summaries.append(
                CityAllocationSummary(
                    city=city,
                    resources=city_resource_totals[city],
                    crews_assigned=sum(w.crews for w in city_allocs),
                    critical_wards=sum(1 for w in city_allocs if w.deficit_level == "critical"),
                    deficit_wards=sum(1 for w in city_allocs if w.deficit_level != "none"),
                )
            )

        all_ward_allocs.sort(key=lambda w: (w.city, -w.priority_weight, w.ward_id))
        solve_ms = round((time.perf_counter() - t0) * 1000.0, 3)
        meta = current_run_meta(model_version=batch.model_version)

        return AllocationResponse(
            model_version=meta.model_version,
            git_sha=meta.git_sha,
            data_as_of=meta.data_as_of,
            offline=meta.offline,
            generated_at=meta.generated_at,
            request=req,
            supply_ratios={
                "saline_bags": ratios.saline_bags,
                "diagnostic_kits": ratios.diagnostic_kits,
                "hospital_beds": ratios.hospital_beds,
            },
            service_levels={
                "saline_bags": saline_level,
                "diagnostic_kits": kits_level,
                "hospital_beds": beds_level,
            },
            crew_method=crew_method,
            wards=all_ward_allocs,
            cities=city_summaries,
            solve_ms=solve_ms,
        )
