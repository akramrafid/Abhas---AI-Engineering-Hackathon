"""One-time online Overpass fetcher for real OSM hospitals across Bangladesh's 5 Abhas cities (ADR-0018).

Usage (run once while online):
    uv run --project apps/api python scripts/fetch_hospitals.py

Executes a single batched Overpass query for `amenity=hospital` and `healthcare=hospital`
across Dhaka North, Dhaka South, Chattogram, Gazipur, and Narayanganj, writing a deterministic
ODbL-attributed GeoJSON snapshot to `apps/api/data/hospitals.geojson`.

Privacy & verification rule (ADR-0018):
  - Keeps a phone number ONLY if explicitly present in OSM `phone` / `contact:phone` tags
    and passing strict sanitisation; otherwise stores `null` (never invents phone numbers).
"""

from __future__ import annotations

import json
import re
import sys
import time
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import httpx

REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = REPO_ROOT / "apps" / "api" / "data" / "hospitals.geojson"

OVERPASS_ENDPOINTS: tuple[str, ...] = (
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)

# (south, west, north, east) bounding boxes separating Dhaka North (>= 23.765) and Dhaka South (< 23.765).
CITY_BBOXES: dict[str, tuple[float, float, float, float]] = {
    "Dhaka North": (23.765, 90.330, 23.895, 90.460),
    "Dhaka South": (23.680, 90.340, 23.765, 90.460),
    "Chattogram": (22.270, 91.750, 22.430, 91.870),
    "Gazipur": (23.940, 90.350, 24.060, 90.460),
    "Narayanganj": (23.580, 90.460, 23.670, 90.540),
}

MAX_PER_CITY = 25
_PHONE_ALLOWED_RE = re.compile(r"^[+0-9()\-\s]{6,24}$")


def sanitise_osm_phone(raw: str | None) -> str | None:
    """Keep ONLY a clean OSM phone tag (first number if semicolon-delimited); else None."""
    if not raw or not isinstance(raw, str):
        return None
    first = raw.split(";")[0].split(",")[0].strip()
    if not _PHONE_ALLOWED_RE.match(first):
        return None
    digits = [ch for ch in first if ch.isdigit()]
    if len(digits) < 6 or len(digits) > 15:
        return None
    return first


def _build_city_query(bbox: tuple[float, float, float, float]) -> str:
    s, w, n, e = bbox
    return (
        "[out:json][timeout:20];"
        "("
        f'node["amenity"="hospital"]({s},{w},{n},{e});'
        f'way["amenity"="hospital"]({s},{w},{n},{e});'
        f'node["healthcare"="hospital"]({s},{w},{n},{e});'
        ");out center tags 60;"
    )


def _fetch_all_elements() -> list[dict[str, Any]]:
    collected: list[dict[str, Any]] = []
    with httpx.Client(follow_redirects=True) as client:
        for city, bbox in CITY_BBOXES.items():
            query = _build_city_query(bbox)
            city_els: list[dict[str, Any]] | None = None
            last_err: Exception | None = None
            for attempt in range(3):
                for endpoint in OVERPASS_ENDPOINTS:
                    print(f"querying {city} (try {attempt + 1}) @ {endpoint} ...", flush=True)
                    try:
                        resp = client.post(
                            endpoint,
                            data={"data": query},
                            headers={"User-Agent": "Abhas-Hackathon-Snapshot/1.0 (+https://abhas.dev)"},
                            timeout=25.0,
                        )
                        print(f"  status={resp.status_code} bytes={len(resp.content)}", flush=True)
                        if resp.status_code == 200:
                            payload = resp.json()
                            city_els = list(payload.get("elements") or [])
                            break
                        last_err = RuntimeError(f"HTTP {resp.status_code} from {endpoint}")
                    except Exception as exc:  # noqa: BLE001
                        print(f"  error={exc}", flush=True)
                        last_err = exc
                    time.sleep(1.5)
                if city_els is not None:
                    break
                time.sleep(2.5)
            if city_els is None:
                raise RuntimeError(f"Overpass fetch failed for {city}: {last_err}")
            collected.extend(city_els)
            time.sleep(1.2)
    return collected


def _classify_city(lat: float, lon: float) -> str | None:
    for city, (s, w, n, e) in CITY_BBOXES.items():
        if s <= lat <= n and w <= lon <= e:
            return city
    return None


def _extract_by_city(elements: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, int]]:
    by_city: dict[str, list[dict[str, Any]]] = {c: [] for c in CITY_BBOXES}
    seen_names: dict[str, set[str]] = {c: set() for c in CITY_BBOXES}

    for el in elements:
        tags = el.get("tags") or {}
        name = (tags.get("name:en") or tags.get("name") or "").strip()
        if not name or len(name) < 3:
            continue

        lat = el.get("lat")
        lon = el.get("lon")
        if (lat is None or lon is None) and isinstance(el.get("center"), dict):
            lat = el["center"].get("lat")
            lon = el["center"].get("lon")
        if lat is None or lon is None:
            continue
        lat_f = round(float(lat), 6)
        lon_f = round(float(lon), 6)

        city = _classify_city(lat_f, lon_f)
        if city is None:
            continue

        norm_name = name.lower()
        if norm_name in seen_names[city]:
            continue

        osm_type = str(el.get("type") or "node")
        osm_id = int(el.get("id") or 0)
        if osm_id <= 0:
            continue

        raw_phone = tags.get("phone") or tags.get("contact:phone") or tags.get("emergency:phone")
        phone = sanitise_osm_phone(raw_phone)
        addr_parts = [
            tags.get("addr:street"),
            tags.get("addr:suburb") or tags.get("addr:neighbourhood"),
            tags.get("addr:city") or city,
        ]
        address = ", ".join(str(p).strip() for p in addr_parts if p and str(p).strip()) or city

        priority = (
            1 if phone else 0,
            1 if str(tags.get("emergency", "")).lower() == "yes" else 0,
            1 if tags.get("name:en") else 0,
            -osm_id,
        )
        seen_names[city].add(norm_name)
        by_city[city].append(
            {
                "_priority": priority,
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon_f, lat_f]},
                "properties": {
                    "id": f"osm-{osm_type}-{osm_id}",
                    "osm_type": osm_type,
                    "osm_id": osm_id,
                    "name": name[:150],
                    "city": city,
                    "address": address[:230],
                    "phone": phone,
                    "emergency_tag": str(tags.get("emergency") or "").lower() == "yes",
                },
            }
        )

    features: list[dict[str, Any]] = []
    counts: dict[str, int] = {}
    for city in CITY_BBOXES:
        rows = by_city[city]
        if not rows:
            raise RuntimeError(f"Zero OSM hospitals extracted for {city}")
        rows.sort(key=lambda r: r["_priority"], reverse=True)
        selected = rows[:MAX_PER_CITY]
        for r in selected:
            r.pop("_priority", None)
        selected.sort(key=lambda r: (r["properties"]["name"].lower(), r["properties"]["id"]))
        counts[city] = len(selected)
        features.extend(selected)
    return features, counts


def main() -> int:
    elements = _fetch_all_elements()
    features, counts = _extract_by_city(elements)
    snapshot = {
        "type": "FeatureCollection",
        "metadata": {
            "snapshot_date": date.today().isoformat(),
            "fetched_at_utc": datetime.now(UTC).isoformat(),
            "source": "OpenStreetMap Overpass API (amenity=hospital / healthcare=hospital)",
            "attribution": "© OpenStreetMap contributors · ODbL 1.0",
            "license": "ODbL-1.0",
            "phone_policy": "Verified OSM phone / contact:phone tags only; null otherwise. Always provide 999 fallback.",
            "counts_by_city": counts,
        },
        "features": features,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT_PATH.relative_to(REPO_ROOT)} ({len(features)} hospitals: {counts})", flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr, flush=True)
        raise SystemExit(1) from exc
