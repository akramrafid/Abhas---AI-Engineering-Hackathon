"""SQLAlchemy adapter + idempotent DEMO GeoJSON seeder for ADR-0018 facilities."""

from __future__ import annotations

import hashlib
import json
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import Engine, desc, func, inspect, select
from sqlalchemy.orm import Session

from app.core.config import API_DIR
from app.ports.facilities import (
    AmbulanceRequestEntity,
    HospitalEntity,
    SnapshotMetadata,
)
from app.shared.facilities import sanitize_phone

from .models import AmbulanceRequestRow, BedUpdateRow, HospitalRow

DEFAULT_HOSPITALS_GEOJSON = API_DIR / "data" / "hospitals.geojson"
DEFAULT_ATTRIBUTION = "© OpenStreetMap contributors · ODbL 1.0"


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def load_hospitals_geojson(path: Path = DEFAULT_HOSPITALS_GEOJSON) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(
            f"Hospital snapshot not found at {path}; run scripts/fetch_hospitals.py while online."
        )
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or not isinstance(raw.get("features"), list):
        raise ValueError("hospitals.geojson must be a GeoJSON FeatureCollection")
    return raw


def _deterministic_demo_beds(
    hospital_id: str, index_in_city: int, now: datetime
) -> tuple[int, int, datetime]:
    """Generate clearly labelled DEMO bed counts with a realistic mix of fresh, stale, and full rows."""
    digest = int(hashlib.sha256(hospital_id.encode("utf-8")).hexdigest()[:8], 16)
    total = 12 + (digest % 29)  # 12..40 dengue-designated demo beds
    bucket = index_in_city % 5
    if bucket == 0:
        # Fresh available (<= 6 h)
        free = 2 + (digest % 7)
        updated = now - timedelta(minutes=25 + (digest % 160))
    elif bucket == 1:
        # Fresh available (<= 6 h)
        free = 1 + (digest % 5)
        updated = now - timedelta(hours=2, minutes=digest % 120)
    elif bucket == 2:
        # Stale available (> 6 h) so Tier 2 stale badge is demonstrably visible
        free = 1 + (digest % 4)
        updated = now - timedelta(hours=7 + (digest % 6), minutes=digest % 60)
    elif bucket == 3:
        # Full (0 free beds, fresh) so Tier 3 fallback & overflow alerts are demonstrable
        free = 0
        updated = now - timedelta(minutes=45 + (digest % 120))
    else:
        # Fresh available
        free = 3 + (digest % 6)
        updated = now - timedelta(hours=1, minutes=digest % 90)
    return total, min(free, total), updated


def seed_hospitals_from_geojson(
    engine: Engine,
    *,
    geojson_path: Path = DEFAULT_HOSPITALS_GEOJSON,
) -> int:
    """Idempotently seed `hospitals` with OSM coordinates & labelled DEMO bed counts."""
    if not inspect(engine).has_table("hospitals"):
        return 0
    if not geojson_path.exists():
        return 0

    with Session(engine) as session:
        existing = int(session.execute(select(func.count()).select_from(HospitalRow)).scalar_one())
        if existing > 0:
            return existing

        data = load_hospitals_geojson(geojson_path)
        now = datetime.now(UTC)
        city_counters: dict[str, int] = {}
        inserted = 0

        for feat in data.get("features") or []:
            props = feat.get("properties") or {}
            geom = feat.get("geometry") or {}
            coords = geom.get("coordinates") or []
            if len(coords) < 2:
                continue
            hid = str(props.get("id") or "").strip()[:64]
            name = str(props.get("name") or "").strip()[:160]
            city = str(props.get("city") or "").strip()[:32]
            if not hid or not name or not city:
                continue

            lon = float(coords[0])
            lat = float(coords[1])
            addr_raw = props.get("address")
            address = str(addr_raw).strip()[:240] if addr_raw else None
            phone = sanitize_phone(props.get("phone"))

            idx_city = city_counters.get(city, 0)
            city_counters[city] = idx_city + 1
            total_beds, free_beds, updated_at = _deterministic_demo_beds(hid, idx_city, now)

            session.add(
                HospitalRow(
                    id=hid,
                    name=name,
                    city=city,
                    lat=lat,
                    lon=lon,
                    address=address,
                    phone=phone,
                    total_beds=total_beds,
                    free_beds=free_beds,
                    data_source="demo",
                    updated_at=updated_at,
                )
            )
            inserted += 1

        session.commit()
        return inserted


class SqlFacilitiesStore:
    """SQLAlchemy implementation of FacilitiesStore (ADR-0018)."""

    def __init__(
        self,
        engine: Engine,
        *,
        geojson_path: Path = DEFAULT_HOSPITALS_GEOJSON,
    ) -> None:
        self._engine = engine
        self._geojson_path = geojson_path
        self._meta_cache: SnapshotMetadata | None = None

    def snapshot_metadata(self) -> SnapshotMetadata:
        if self._meta_cache is not None:
            return self._meta_cache
        if self._geojson_path.exists():
            raw = load_hospitals_geojson(self._geojson_path)
            meta = raw.get("metadata") or {}
            self._meta_cache = SnapshotMetadata(
                snapshot_date=str(meta.get("snapshot_date") or "2026-11-27"),
                attribution=str(meta.get("attribution") or DEFAULT_ATTRIBUTION),
            )
        else:
            self._meta_cache = SnapshotMetadata(
                snapshot_date="2026-11-27",
                attribution=DEFAULT_ATTRIBUTION,
            )
        return self._meta_cache

    @staticmethod
    def _to_hospital(row: HospitalRow) -> HospitalEntity:
        return HospitalEntity(
            id=row.id,
            name=row.name,
            city=row.city,
            lat=float(row.lat),
            lon=float(row.lon),
            address=row.address,
            phone=sanitize_phone(row.phone),
            total_beds=int(row.total_beds),
            free_beds=int(row.free_beds),
            data_source=row.data_source,
            updated_at=_ensure_utc(row.updated_at),
        )

    def list_hospitals(self, *, city: str | None = None) -> Sequence[HospitalEntity]:
        with Session(self._engine) as session:
            stmt = select(HospitalRow).order_by(HospitalRow.city, HospitalRow.name, HospitalRow.id)
            if city is not None:
                stmt = stmt.where(HospitalRow.city == city)
            rows = session.execute(stmt).scalars().all()
            return [self._to_hospital(r) for r in rows]

    def get_hospital(self, hospital_id: str) -> HospitalEntity | None:
        with Session(self._engine) as session:
            row = session.get(HospitalRow, hospital_id)
            return self._to_hospital(row) if row is not None else None

    def update_beds(
        self,
        *,
        hospital_id: str,
        free_beds: int,
        total_beds: int,
        note: str | None = None,
    ) -> tuple[HospitalEntity, int]:
        now = datetime.now(UTC)
        with Session(self._engine) as session:
            row = session.get(HospitalRow, hospital_id)
            if row is None:
                raise KeyError(hospital_id)
            row.free_beds = int(free_beds)
            row.total_beds = int(total_beds)
            row.data_source = "board"
            row.updated_at = now

            upd = BedUpdateRow(
                hospital_id=hospital_id,
                free_beds=int(free_beds),
                total_beds=int(total_beds),
                data_source="board",
                note=note,
                updated_at=now,
            )
            session.add(upd)
            session.flush()
            update_id = int(upd.id)
            entity = self._to_hospital(row)
            session.commit()
            return entity, update_id

    def create_ambulance_request(
        self,
        *,
        hospital_id: str,
        city: str,
        severity: str,
        beds_requested: int,
        dispatcher_note: str | None = None,
    ) -> AmbulanceRequestEntity:
        now = datetime.now(UTC)
        req_id = str(uuid.uuid4())
        with Session(self._engine) as session:
            hosp = session.get(HospitalRow, hospital_id)
            if hosp is None:
                raise KeyError(hospital_id)
            row = AmbulanceRequestRow(
                id=req_id,
                hospital_id=hospital_id,
                city=city,
                severity=severity,
                beds_requested=int(beds_requested),
                dispatcher_note=dispatcher_note,
                status="logged",
                created_at=now,
            )
            session.add(row)
            session.commit()
            return AmbulanceRequestEntity(
                id=req_id,
                hospital_id=hospital_id,
                hospital_name=hosp.name,
                city=city,
                severity=severity,
                beds_requested=int(beds_requested),
                dispatcher_note=dispatcher_note,
                status="logged",
                created_at=now,
            )

    def list_ambulance_requests(
        self,
        *,
        city: str | None = None,
        limit: int = 20,
    ) -> Sequence[AmbulanceRequestEntity]:
        with Session(self._engine) as session:
            stmt = (
                select(AmbulanceRequestRow, HospitalRow.name)
                .join(HospitalRow, AmbulanceRequestRow.hospital_id == HospitalRow.id)
                .order_by(desc(AmbulanceRequestRow.created_at), AmbulanceRequestRow.id)
                .limit(max(1, min(int(limit), 100)))
            )
            if city is not None:
                stmt = stmt.where(AmbulanceRequestRow.city == city)
            rows = session.execute(stmt).all()
            return [
                AmbulanceRequestEntity(
                    id=r.id,
                    hospital_id=r.hospital_id,
                    hospital_name=str(h_name),
                    city=r.city,
                    severity=r.severity,
                    beds_requested=int(r.beds_requested),
                    dispatcher_note=r.dispatcher_note,
                    status=r.status,
                    created_at=_ensure_utc(r.created_at),
                )
                for r, h_name in rows
            ]
