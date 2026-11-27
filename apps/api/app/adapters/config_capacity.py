"""Config-backed BedCapacitySource adapter reading apps/api/config/ward_capacity.json (contracts §3, §5; ADR-0012)."""

from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import API_DIR
from app.core.errors import AppError

DEFAULT_WARD_CAPACITY_PATH: Path = API_DIR / "config" / "ward_capacity.json"
EXPECTED_DATASET_SHA256: str = "24fac5430af369142fcb3b1f0bd1fb99ca4583c618f83336d5dee58a5ebef9b0"
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


class ConfigBedCapacitySource:
    """Implements app.ports.capacity.BedCapacitySource from the committed ward_capacity.json config."""

    def __init__(self, path: Path | None = None) -> None:
        target = path if path is not None else DEFAULT_WARD_CAPACITY_PATH
        raw = self._read_payload(target)

        method = raw.get("method")
        if not isinstance(method, str) or not method.strip():
            raise AppError(
                status=503,
                slug="not-ready",
                title="Ward capacity configuration invalid",
                detail="Ward capacity configuration is missing a valid derivation method.",
            )

        sha = str(raw.get("dataset_sha256") or "").strip().lower()
        if not _SHA256_RE.fullmatch(sha):
            raise AppError(
                status=503,
                slug="not-ready",
                title="Ward capacity configuration invalid",
                detail="Ward capacity configuration is missing a valid dataset SHA-256 digest.",
            )

        raw_wards = raw.get("wards")
        if not isinstance(raw_wards, Mapping) or not raw_wards:
            raise AppError(
                status=503,
                slug="not-ready",
                title="Ward capacity configuration invalid",
                detail="Ward capacity configuration contains no ward entries.",
            )

        wards: dict[str, int] = {}
        for wid, cap in raw_wards.items():
            if not isinstance(wid, str) or not wid.strip():
                raise AppError(
                    status=503,
                    slug="not-ready",
                    title="Ward capacity configuration invalid",
                    detail="Ward capacity configuration contains an invalid ward identifier.",
                )
            if isinstance(cap, bool) or not isinstance(cap, int) or cap < 1:
                raise AppError(
                    status=503,
                    slug="not-ready",
                    title="Ward capacity configuration invalid",
                    detail="Ward capacity values must be positive integers.",
                )
            wards[wid] = cap

        raw_years = raw.get("fitted_years")
        fitted_years: tuple[int, int] = (2016, 2022)
        if (
            isinstance(raw_years, list)
            and len(raw_years) == 2
            and all(isinstance(y, int) and not isinstance(y, bool) for y in raw_years)
        ):
            fitted_years = (int(raw_years[0]), int(raw_years[1]))

        raw_total = raw.get("total_beds")
        computed_total = sum(wards.values())
        if isinstance(raw_total, int) and not isinstance(raw_total, bool) and raw_total != computed_total:
            raise AppError(
                status=503,
                slug="not-ready",
                title="Ward capacity configuration invalid",
                detail="Ward capacity total_beds does not match the sum of ward capacities.",
            )

        self.method: str = method.strip()
        self.dataset_sha256: str = sha
        self.fitted_years: tuple[int, int] = fitted_years
        self.assumption: str = str(raw.get("assumption") or "").strip()
        self.total_beds: int = computed_total
        self._wards: dict[str, int] = wards

    @staticmethod
    def _read_payload(target: Path) -> Mapping[str, Any]:
        if not target.is_file():
            raise AppError(
                status=503,
                slug="not-ready",
                title="Ward capacity configuration unavailable",
                detail="Ward capacity configuration file is missing; run npm run fit:supply.",
            )
        try:
            data = json.loads(target.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise AppError(
                status=503,
                slug="not-ready",
                title="Ward capacity configuration unreadable",
                detail="Ward capacity configuration file could not be parsed.",
            ) from exc
        if not isinstance(data, Mapping):
            raise AppError(
                status=503,
                slug="not-ready",
                title="Ward capacity configuration invalid",
                detail="Ward capacity configuration root must be a JSON object.",
            )
        return data

    def capacity(self, ward_ids: Sequence[str]) -> Mapping[str, int]:
        """Return positive integer capacities for every requested ward_id; raise KeyError on unknown ward."""
        result: dict[str, int] = {}
        for wid in ward_ids:
            if wid not in self._wards:
                raise KeyError(wid)
            result[wid] = self._wards[wid]
        return result

    def all_ward_ids(self) -> frozenset[str]:
        """Return the set of all configured ward IDs."""
        return frozenset(self._wards.keys())


@lru_cache(maxsize=1)
def _cached_default_source() -> ConfigBedCapacitySource:
    return ConfigBedCapacitySource(DEFAULT_WARD_CAPACITY_PATH)


def get_bed_capacity_source(path: Path | None = None) -> ConfigBedCapacitySource:
    """Return the cached default BedCapacitySource (or load an explicit path for tests)."""
    if path is None:
        return _cached_default_source()
    return ConfigBedCapacitySource(path)


def clear_bed_capacity_cache() -> None:
    """Clear the cached default BedCapacitySource (for tests)."""
    _cached_default_source.cache_clear()


def check_ward_capacity_ready(
    path: Path | None = None,
    *,
    expected_sha256: str = EXPECTED_DATASET_SHA256,
) -> bool:
    """Return True when ward_capacity.json loads cleanly and matches the expected onsite dataset SHA-256."""
    try:
        src = get_bed_capacity_source(path)
    except Exception:  # noqa: BLE001
        return False
    return bool(src.all_ward_ids()) and src.dataset_sha256 == expected_sha256.lower()
