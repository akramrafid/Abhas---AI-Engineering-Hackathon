"""Business logic for the overflow routing vertical slice (framework-free; contracts §2.2; ADR-0012)."""

from __future__ import annotations

import json
import math
import time
from collections.abc import Callable, Mapping
from functools import lru_cache
from pathlib import Path
from typing import Any, cast

from scipy.stats import nbinom, poisson

from app.core.config import API_DIR
from app.core.errors import AppError
from app.core.run_meta import current_run_meta
from app.core.types import CITIES, City
from app.ports.capacity import BedCapacitySource
from app.ports.repositories import ObservationRepository, WardRecord
from app.shared.forecast_engine import ForecastEngine
from app.shared.routing import route_city, summarise_city

from .schemas import (
    CapacitySource,
    CityBedSummary,
    OverflowRequest,
    OverflowResponse,
    Transfer,
    WardBedStatus,
)

DEFAULT_SUPPLY_RATIOS_PATH: Path = API_DIR / "config" / "supply_ratios.json"
_FALLBACK_NB_R: float = 5.0


def round_half_up(value: float) -> int:
    """Deterministic round-half-up: floor(x + 0.5) matching ADR-0009 and the onsite dataset rule."""
    return int(math.floor(float(value) + 0.5))


def single_week_case_quantile(mean: float, nb_r: float, q: float) -> int:
    """Single-horizon NB / Poisson service-level case quantile matching ADR-0009 (§1)."""
    mu = float(mean)
    if not math.isfinite(mu) or mu <= 0.0:
        return 0
    r = float(nb_r)
    if math.isfinite(r) and r > 0.0:
        var = mu + (mu * mu) / r
    else:
        var = mu
    if var > mu:
        p = r / (r + mu)
        raw_q = float(nbinom.ppf(q, r, p))
    else:
        raw_q = float(poisson.ppf(q, mu))
    if not math.isfinite(raw_q):
        return 0
    return max(0, int(round(raw_q)))


@lru_cache(maxsize=1)
def _cached_default_bed_ratio() -> float:
    return _read_bed_ratio(DEFAULT_SUPPLY_RATIOS_PATH)


def _read_bed_ratio(path: Path) -> float:
    if not path.is_file():
        raise AppError(
            status=503,
            slug="not-ready",
            title="Supply ratios configuration unavailable",
            detail="Supply ratios configuration file is missing; run npm run fit:supply.",
        )
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        ratio = float(payload["ratios"]["hospital_beds"])
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise AppError(
            status=503,
            slug="not-ready",
            title="Supply ratios configuration invalid",
            detail="Supply ratios configuration could not be parsed.",
        ) from exc
    if not math.isfinite(ratio) or ratio < 0.0:
        raise AppError(
            status=503,
            slug="not-ready",
            title="Supply ratios configuration invalid",
            detail="Hospital beds ratio must be a non-negative finite number.",
        )
    return ratio


def load_hospital_bed_ratio(path: Path | None = None) -> float:
    """Return the verified per-case hospital_beds constant from config/supply_ratios.json."""
    if path is None:
        return _cached_default_bed_ratio()
    return _read_bed_ratio(path)


class OverflowService:
    """Computes intra-city hospital bed overflow routing plans strictly within each city pool."""

    def __init__(
        self,
        repo: ObservationRepository | None = None,
        engine: ForecastEngine | None = None,
        capacity_source: BedCapacitySource | None = None,
        *,
        bed_ratio: float | None = None,
        nb_size_fn: Callable[[int], float] | None = None,
        db_fault_hook: Callable[[], None] | None = None,
    ) -> None:
        self._repo = repo
        self._engine = engine
        self._capacity_source = capacity_source
        self._bed_ratio = bed_ratio
        self._nb_size_fn = nb_size_fn
        self._db_fault_hook = db_fault_hook

    def _resolve_nb_r(self, engine: ForecastEngine, horizon: int) -> float:
        if self._nb_size_fn is not None:
            return float(self._nb_size_fn(horizon))
        nb_size = getattr(engine, "nb_size", None)
        if callable(nb_size):
            return float(cast(Any, nb_size)(horizon))
        model = getattr(engine, "_model", None)
        cals = getattr(model, "calibrations", None)
        if isinstance(cals, Mapping) and horizon in cals:
            return float(cals[horizon].nb_r)
        return _FALLBACK_NB_R

    def _validate_overrides(
        self,
        overrides: Mapping[str, int],
        repo: ObservationRepository,
        capacity_source: BedCapacitySource,
    ) -> None:
        if not overrides:
            return
        override_ids = sorted(overrides.keys())
        try:
            capacity_source.capacity(override_ids)
        except KeyError as exc:
            unknown_id = str(exc.args[0]) if exc.args else override_ids[0]
            raise AppError(
                status=404,
                slug="unknown-ward",
                title="Unknown ward",
                detail=f"Unknown ward_id in capacity_overrides: {unknown_id}",
            ) from exc

        for wid in override_ids:
            try:
                rec = repo.ward(wid)
            except Exception as exc:  # noqa: BLE001
                raise AppError(
                    status=503,
                    slug="db-unavailable",
                    title="Database unavailable",
                    detail="Could not verify ward_id in capacity_overrides.",
                ) from exc
            if rec is None:
                raise AppError(
                    status=404,
                    slug="unknown-ward",
                    title="Unknown ward",
                    detail=f"Unknown ward_id in capacity_overrides: {wid}",
                )

    def route(self, req: OverflowRequest) -> OverflowResponse:
        if self._repo is None or self._engine is None or self._capacity_source is None:
            raise NotImplementedError("OverflowService requires repo, engine, and capacity_source")

        started = time.perf_counter()
        repo = self._repo
        engine = self._engine
        capacity_source = self._capacity_source

        if self._db_fault_hook is not None:
            self._db_fault_hook()

        engine.validate_origin(req.origin_week, source="dataset")
        self._validate_overrides(req.capacity_overrides, repo, capacity_source)

        bed_ratio = self._bed_ratio if self._bed_ratio is not None else load_hospital_bed_ratio()

        city_filter = None if req.scope == "all" else req.scope
        try:
            scoped_wards = list(repo.wards(city=city_filter))
        except Exception as exc:  # noqa: BLE001
            raise AppError(
                status=503,
                slug="db-unavailable",
                title="Database unavailable",
                detail="Could not load wards for overflow routing.",
            ) from exc

        if not scoped_wards:
            raise AppError(
                status=404,
                slug="unknown-city",
                title="Unknown city",
                detail=f"No wards found for scope {req.scope!r}.",
            )

        wards_by_city: dict[str, list[WardRecord]] = {}
        for ward in scoped_wards:
            wards_by_city.setdefault(ward.city, []).append(ward)

        ordered_cities = [c for c in CITIES if c in wards_by_city] + sorted(
            c for c in wards_by_city if c not in CITIES
        )
        for city in ordered_cities:
            wards_by_city[city].sort(key=lambda w: w.ward_id)

        all_ward_ids = [w.ward_id for city in ordered_cities for w in wards_by_city[city]]
        try:
            derived_caps = capacity_source.capacity(all_ward_ids)
        except KeyError as exc:
            unknown_id = str(exc.args[0]) if exc.args else "unknown"
            raise AppError(
                status=404,
                slug="unknown-ward",
                title="Unknown ward",
                detail=f"Unknown ward_id in capacity source: {unknown_id}",
            ) from exc

        batch = engine.forecast(
            ward_ids=all_ward_ids,
            origin_week=req.origin_week,
            horizons=[req.horizon],
            source="dataset",
        )
        fc_by_ward = {wf.ward_id: wf.horizons[0] for wf in batch.forecasts}
        nb_r = self._resolve_nb_r(engine, req.horizon)

        beds_required_by_ward: dict[str, int] = {}
        for wid in all_ward_ids:
            hf = fc_by_ward[wid]
            planned_cases = single_week_case_quantile(hf.expected_cases, nb_r, req.service_level)
            beds_required_by_ward[wid] = round_half_up(bed_ratio * planned_cases)

        ward_statuses: list[WardBedStatus] = []
        transfers: list[Transfer] = []
        city_summaries: list[CityBedSummary] = []

        for city in ordered_cities:
            city_wards = wards_by_city[city]
            wids = [w.ward_id for w in city_wards]
            req_beds = [beds_required_by_ward[wid] for wid in wids]
            caps: list[int] = []
            cap_sources: list[CapacitySource] = []
            for wid in wids:
                if wid in req.capacity_overrides:
                    caps.append(int(req.capacity_overrides[wid]))
                    cap_sources.append("override")
                else:
                    caps.append(int(derived_caps[wid]))
                    cap_sources.append("derived")

            try:
                routing = route_city(req_beds, caps, wids)
            except RuntimeError as exc:
                raise AppError(
                    status=409,
                    slug="infeasible",
                    title="Overflow routing infeasible",
                    detail=str(exc),
                ) from exc

            out_by_ward: dict[str, int] = {}
            in_by_ward: dict[str, int] = {}
            for arc in routing.transfers:
                out_by_ward[arc.from_ward] = out_by_ward.get(arc.from_ward, 0) + arc.patients
                in_by_ward[arc.to_ward] = in_by_ward.get(arc.to_ward, 0) + arc.patients
                transfers.append(
                    Transfer(
                        city=cast(City, city),
                        from_ward=arc.from_ward,
                        to_ward=arc.to_ward,
                        patients=arc.patients,
                    )
                )

            for idx, wid in enumerate(wids):
                r_i = req_beds[idx]
                c_i = caps[idx]
                load_after = routing.loads[idx]
                ward_statuses.append(
                    WardBedStatus(
                        ward_id=wid,
                        city=cast(City, city),
                        beds_required=r_i,
                        capacity=c_i,
                        capacity_source=cap_sources[idx],
                        local_deficit=max(r_i - c_i, 0),
                        headroom_before=max(c_i - r_i, 0),
                        transferred_out=out_by_ward.get(wid, 0),
                        transferred_in=in_by_ward.get(wid, 0),
                        net_deficit=max(load_after - c_i, 0),
                        utilisation_before=r_i / c_i,
                        utilisation_after=load_after / c_i,
                    )
                )

            stats = summarise_city(req_beds, caps, routing.loads, transfers=len(routing.transfers))
            city_summaries.append(
                CityBedSummary(
                    city=cast(City, city),
                    capacity_total=stats.capacity_total,
                    required_total=stats.required_total,
                    utilisation_before=stats.utilisation_before,
                    utilisation_after=stats.utilisation_after,
                    headroom_after=stats.headroom_after,
                    unroutable_patients=stats.unroutable_patients,
                    transfers=stats.transfers,
                )
            )

        solve_ms = round((time.perf_counter() - started) * 1000.0, 3)
        meta = current_run_meta(model_version=batch.model_version)
        return OverflowResponse(
            model_version=meta.model_version,
            git_sha=meta.git_sha,
            data_as_of=meta.data_as_of,
            offline=meta.offline,
            generated_at=meta.generated_at,
            request=req,
            capacity_method=capacity_source.method,
            wards=ward_statuses,
            transfers=transfers,
            cities=city_summaries,
            solve_ms=solve_ms,
        )
