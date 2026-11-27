"""Pure, deterministic, offline Nearest Bed & Ambulance maths (ADR-0018).

Framework-free module: zero FastAPI, SQLAlchemy, or network imports.
Provides:
  - Haversine great-circle distance (km) and straight-line ETA estimate (minutes)
  - Strict OSM phone & `tel:` URI sanitisation (rejects javascript:, CRLF, non-phone garbage)
  - Control/bidi character validation for control-room notes
  - 3-tier nearest-bed ranking matching ADR-0018 examples F1–F3
"""

from __future__ import annotations

import math
import re
from collections.abc import Sequence
from dataclasses import dataclass

EARTH_RADIUS_KM = 6371.0
ESTIMATED_URBAN_SPEED_KMH = 18.0
DISPATCH_BUFFER_MIN = 5.0
STALE_AFTER_HOURS = 6.0

_PHONE_ALLOWED_RE = re.compile(r"^[+0-9()\-\s]{6,24}$")
_UNSAFE_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]")


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two WGS-84 coordinates in kilometres."""
    phi1 = math.radians(float(lat1))
    phi2 = math.radians(float(lat2))
    dphi = math.radians(float(lat2) - float(lat1))
    dlam = math.radians(float(lon2) - float(lon1))
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * (math.sin(dlam / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return EARTH_RADIUS_KM * c


def straight_line_eta_minutes(distance_km: float) -> int:
    """Conservative straight-line ETA estimate: ceil(km / 18 * 60 + 5) minutes."""
    km = max(0.0, float(distance_km))
    return int(math.ceil((km / ESTIMATED_URBAN_SPEED_KMH) * 60.0 + DISPATCH_BUFFER_MIN))


def sanitize_phone(raw: str | None) -> str | None:
    """Validate an OSM-verified phone string; reject schemes, HTML, control chars, or junk."""
    if raw is None or not isinstance(raw, str):
        return None
    cleaned = raw.strip()
    if not cleaned or _UNSAFE_CONTROL_RE.search(cleaned):
        return None
    if not _PHONE_ALLOWED_RE.match(cleaned):
        return None
    digits = [ch for ch in cleaned if ch.isdigit()]
    if len(digits) < 3 or len(digits) > 15:
        return None
    return cleaned


def build_tel_href(phone: str | None) -> str | None:
    """Build a strict RFC 3966 `tel:` URI from a verified phone number, or None if invalid."""
    safe = sanitize_phone(phone)
    if safe is None:
        return None
    prefix = "+" if safe.startswith("+") else ""
    digits = "".join(ch for ch in safe if ch.isdigit())
    if len(digits) < 3:
        return None
    return f"tel:{prefix}{digits}"


def has_unsafe_control_chars(text: str) -> bool:
    """Return True if text contains ASCII control or Unicode bidi override characters."""
    return bool(_UNSAFE_CONTROL_RE.search(text))


@dataclass(frozen=True)
class HospitalCandidate:
    """Minimal hospital record for pure ADR-0018 nearest-bed ranking."""

    id: str
    city: str
    lat: float
    lon: float
    free_beds: int
    age_hours: float


@dataclass(frozen=True)
class RankedHospital:
    """Ranked hospital with Haversine distance, straight-line ETA estimate, and tier code."""

    id: str
    city: str
    distance_km: float
    eta_minutes: int
    rank_tier: int  # 1 = fresh available, 2 = stale available, 3 = full / city alternative
    is_stale: bool
    free_beds: int


def rank_hospitals(
    hospitals: Sequence[HospitalCandidate],
    *,
    user_lat: float,
    user_lon: float,
    user_city: str | None = None,
    stale_after_hours: float = STALE_AFTER_HOURS,
) -> list[RankedHospital]:
    """Rank hospitals deterministically per ADR-0018 (F1, F2, F3).

    Tier 1: free_beds >= 1 AND age_hours <= stale_after_hours (nearest first, ties: more free beds, id)
    Tier 2: free_beds >= 1 AND age_hours > stale_after_hours (stale flagged, nearest first)
    Tier 3: free_beds == 0 (same-city alternative first if user_city provided, then nearest overall)
    """
    scored: list[tuple[tuple[int, int, float, int, str], RankedHospital]] = []
    for h in hospitals:
        dist = haversine_km(user_lat, user_lon, h.lat, h.lon)
        eta = straight_line_eta_minutes(dist)
        is_stale = float(h.age_hours) > float(stale_after_hours)
        if h.free_beds >= 1 and not is_stale:
            tier = 1
            same_city_pen = 0
        elif h.free_beds >= 1:
            tier = 2
            same_city_pen = 0
        else:
            tier = 3
            same_city_pen = 0 if (user_city is None or h.city == user_city) else 1

        ranked = RankedHospital(
            id=h.id,
            city=h.city,
            distance_km=round(dist, 3),
            eta_minutes=eta,
            rank_tier=tier,
            is_stale=is_stale,
            free_beds=int(h.free_beds),
        )
        key = (tier, same_city_pen, round(dist, 6), -int(h.free_beds), h.id)
        scored.append((key, ranked))

    scored.sort(key=lambda item: item[0])
    return [item[1] for item in scored]
