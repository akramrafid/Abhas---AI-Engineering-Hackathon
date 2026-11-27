"""HTTP router for Nearest Bed & Ambulance facilities endpoints (ADR-0018)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Path, Query, Response

from app.core.errors import PROBLEM_RESPONSES
from app.core.types import City

from .deps import get_facilities_service, require_facility_manager
from .schemas import (
    AmbulanceRequestCreate,
    AmbulanceRequestList,
    AmbulanceRequestRecord,
    BedUpdateRequest,
    BedUpdateResponse,
    HospitalsResponse,
)
from .service import FacilitiesService

router = APIRouter(prefix="/api/v1", tags=["facilities"], responses=PROBLEM_RESPONSES)


@router.get(
    "/facilities/hospitals",
    response_model=HospitalsResponse,
    summary="OSM hospital snapshot with DEMO/board bed availability and city forecast tiers",
)
def get_hospitals(
    response: Response,
    city: City | None = Query(default=None, description="Optional city filter"),
    svc: FacilitiesService = Depends(get_facilities_service),
) -> HospitalsResponse:
    response.headers["Cache-Control"] = "no-store"
    return svc.list_hospitals(city=city)


@router.post(
    "/facilities/beds/{hospital_id}",
    response_model=BedUpdateResponse,
    summary="Update hospital bed availability (manager role required)",
)
def post_bed_update(
    req: BedUpdateRequest,
    hospital_id: str = Path(min_length=1, max_length=64),
    _role: str = Depends(require_facility_manager),
    svc: FacilitiesService = Depends(get_facilities_service),
) -> BedUpdateResponse:
    return svc.update_beds(hospital_id=hospital_id, req=req)


@router.post(
    "/facilities/ambulance-requests",
    response_model=AmbulanceRequestRecord,
    status_code=201,
    summary="Log a control-room ambulance coordination request (strictly zero patient PII)",
)
def post_ambulance_request(
    req: AmbulanceRequestCreate,
    svc: FacilitiesService = Depends(get_facilities_service),
) -> AmbulanceRequestRecord:
    return svc.create_ambulance_request(req)


@router.get(
    "/facilities/ambulance-requests",
    response_model=AmbulanceRequestList,
    summary="List recent control-room ambulance requests (zero patient PII)",
)
def get_ambulance_requests(
    response: Response,
    city: City | None = Query(default=None, description="Optional city filter"),
    limit: int = Query(default=20, ge=1, le=100),
    svc: FacilitiesService = Depends(get_facilities_service),
) -> AmbulanceRequestList:
    response.headers["Cache-Control"] = "no-store"
    return svc.list_ambulance_requests(city=city, limit=limit)
