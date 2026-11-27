"""Framework-free service for Nearest Bed & Ambulance control-room operations (ADR-0018)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import cast

from app.core.errors import AppError
from app.core.run_meta import current_run_meta
from app.core.types import CITIES, City, Tier
from app.ports.facilities import FacilitiesStore, HospitalEntity
from app.ports.repositories import ObservationRepository
from app.shared.facilities import STALE_AFTER_HOURS, build_tel_href
from app.shared.tiers import peak_tier, tier_from_cases

from .schemas import (
    BED_DATA_DISCLAIMER,
    AmbulanceRequestCreate,
    AmbulanceRequestList,
    AmbulanceRequestRecord,
    AmbulanceSeverity,
    BedDataSource,
    BedUpdateRequest,
    BedUpdateResponse,
    HospitalRecord,
    HospitalsResponse,
)


class FacilitiesService:
    """Serves OSM hospital snapshots, manager bed-board updates, and zero-PII ambulance logs."""

    def __init__(
        self,
        store: FacilitiesStore,
        obs_repo: ObservationRepository | None = None,
    ) -> None:
        self._store = store
        self._obs_repo = obs_repo

    def _compute_city_forecast_tiers(self) -> dict[str, Tier]:
        """Compute each city's latest peak risk tier from recent observed ward caseloads (offline, < 3 ms)."""
        tiers: dict[str, Tier] = {c: "Medium" for c in CITIES}
        if self._obs_repo is None:
            return tiers
        try:
            wards = self._obs_repo.wards()
            by_city: dict[str, list[str]] = {}
            for w in wards:
                by_city.setdefault(w.city, []).append(w.ward_id)
            for city, ward_ids in by_city.items():
                city_ward_tiers: list[str] = []
                for wid in ward_ids[:5]:
                    hist = self._obs_repo.history(wid)
                    if hist:
                        max_cases = max(float(o.dengue_cases) for o in hist[-4:])
                        city_ward_tiers.append(tier_from_cases(max_cases))
                if city_ward_tiers:
                    tiers[city] = cast(Tier, peak_tier(city_ward_tiers))
        except Exception:  # noqa: BLE001
            return tiers
        return tiers

    def _to_record(
        self,
        entity: HospitalEntity,
        *,
        now: datetime,
        city_tiers: dict[str, Tier],
    ) -> HospitalRecord:
        age_hours = max(0.0, (now - entity.updated_at).total_seconds() / 3600.0)
        return HospitalRecord(
            id=entity.id,
            name=entity.name,
            city=cast(City, entity.city),
            lat=entity.lat,
            lon=entity.lon,
            address=entity.address,
            phone=entity.phone,
            tel_href=build_tel_href(entity.phone),
            total_beds=entity.total_beds,
            free_beds=entity.free_beds,
            data_source=cast(BedDataSource, entity.data_source),
            updated_at=entity.updated_at,
            age_hours=round(age_hours, 2),
            is_stale=age_hours > STALE_AFTER_HOURS,
            forecast_tier=city_tiers.get(entity.city, "Medium"),
        )

    def list_hospitals(self, *, city: City | None = None) -> HospitalsResponse:
        now = datetime.now(UTC)
        snap = self._store.snapshot_metadata()
        city_tiers = self._compute_city_forecast_tiers()
        entities = self._store.list_hospitals(city=city)
        records = [self._to_record(e, now=now, city_tiers=city_tiers) for e in entities]
        meta = current_run_meta()
        return HospitalsResponse(
            **meta.model_dump(),
            snapshot_date=snap.snapshot_date,
            attribution=snap.attribution,
            bed_data_disclaimer=BED_DATA_DISCLAIMER,
            stale_after_hours=STALE_AFTER_HOURS,
            emergency_number="999",
            city_filter=city,
            city_forecast_tiers=city_tiers,
            hospitals=records,
        )

    def update_beds(self, *, hospital_id: str, req: BedUpdateRequest) -> BedUpdateResponse:
        try:
            entity, update_id = self._store.update_beds(
                hospital_id=hospital_id,
                free_beds=req.free_beds,
                total_beds=req.total_beds,
                note=req.note,
            )
        except KeyError as exc:
            raise AppError(
                404,
                "unknown-hospital",
                "Unknown hospital",
                f"No hospital with id {hospital_id}",
            ) from exc

        now = datetime.now(UTC)
        city_tiers = self._compute_city_forecast_tiers()
        meta = current_run_meta()
        return BedUpdateResponse(
            **meta.model_dump(),
            hospital=self._to_record(entity, now=now, city_tiers=city_tiers),
            update_id=update_id,
        )

    def create_ambulance_request(self, req: AmbulanceRequestCreate) -> AmbulanceRequestRecord:
        hosp = self._store.get_hospital(req.hospital_id)
        if hosp is None:
            raise AppError(
                404,
                "unknown-hospital",
                "Unknown hospital",
                f"No hospital with id {req.hospital_id}",
            )
        if hosp.city != req.city:
            raise AppError(
                422,
                "validation-error",
                "City mismatch",
                f"Hospital {req.hospital_id} belongs to {hosp.city}, not {req.city}",
            )

        entity = self._store.create_ambulance_request(
            hospital_id=req.hospital_id,
            city=req.city,
            severity=req.severity,
            beds_requested=req.beds_requested,
            dispatcher_note=req.dispatcher_note,
        )
        meta = current_run_meta()
        return AmbulanceRequestRecord(
            **meta.model_dump(),
            id=entity.id,
            hospital_id=entity.hospital_id,
            hospital_name=entity.hospital_name,
            city=cast(City, entity.city),
            severity=cast(AmbulanceSeverity, entity.severity),
            beds_requested=entity.beds_requested,
            dispatcher_note=entity.dispatcher_note,
            status="logged",
            created_at=entity.created_at,
        )

    def list_ambulance_requests(
        self,
        *,
        city: City | None = None,
        limit: int = 20,
    ) -> AmbulanceRequestList:
        entities = self._store.list_ambulance_requests(city=city, limit=limit)
        meta = current_run_meta()
        items = [
            AmbulanceRequestRecord(
                **meta.model_dump(),
                id=e.id,
                hospital_id=e.hospital_id,
                hospital_name=e.hospital_name,
                city=cast(City, e.city),
                severity=cast(AmbulanceSeverity, e.severity),
                beds_requested=e.beds_requested,
                dispatcher_note=e.dispatcher_note,
                status="logged",
                created_at=e.created_at,
            )
            for e in entities
        ]
        return AmbulanceRequestList(**meta.model_dump(), requests=items)
