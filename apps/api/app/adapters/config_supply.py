"""Adapter: validated SupplyRatioSource reading apps/api/config/supply_ratios.json (contracts §3, §5)."""

from __future__ import annotations

import hmac
import json
import math
from pathlib import Path
from threading import RLock
from typing import Any

from app.core.config import API_DIR
from app.core.errors import AppError
from app.ports.supply import SupplyRatios

EXPECTED_ONSITE_SHA256 = "24fac5430af369142fcb3b1f0bd1fb99ca4583c618f83336d5dee58a5ebef9b0"
DEFAULT_SUPPLY_RATIOS_PATH = API_DIR / "config" / "supply_ratios.json"
_REQUIRED_RESOURCES: tuple[str, ...] = ("saline_bags", "diagnostic_kits", "hospital_beds")

_lock = RLock()
_singleton: ConfigSupplyRatioSource | None = None


class SupplyRatiosUnavailableError(AppError):
    """Raised when config/supply_ratios.json is missing, corrupted, or fails verification."""

    def __init__(self, detail: str) -> None:
        super().__init__(
            status=503,
            slug="not-ready",
            title="Supply ratios unavailable",
            detail=detail,
        )


def _parse_and_validate(raw: Any, *, expected_sha256: str) -> SupplyRatios:
    if not isinstance(raw, dict):
        raise SupplyRatiosUnavailableError("supply_ratios.json root must be a JSON object.")

    dataset_sha = str(raw.get("dataset_sha256") or "").strip().lower()
    expected = expected_sha256.strip().lower()
    if len(dataset_sha) != 64 or not hmac.compare_digest(dataset_sha, expected):
        raise SupplyRatiosUnavailableError("supply_ratios.json dataset_sha256 does not match onsite dataset.")

    ratios_raw = raw.get("ratios")
    if not isinstance(ratios_raw, dict):
        raise SupplyRatiosUnavailableError("supply_ratios.json is missing 'ratios' object.")

    parsed_ratios: dict[str, float] = {}
    for key in _REQUIRED_RESOURCES:
        if key not in ratios_raw or isinstance(ratios_raw[key], bool):
            raise SupplyRatiosUnavailableError(f"supply_ratios.json is missing valid ratio for {key}.")
        try:
            val = float(ratios_raw[key])
        except (TypeError, ValueError) as exc:
            raise SupplyRatiosUnavailableError(
                f"supply_ratios.json has non-numeric ratio for {key}."
            ) from exc
        if not math.isfinite(val) or val <= 0.0:
            raise SupplyRatiosUnavailableError(f"supply_ratios.json ratio for {key} must be finite and > 0.")
        parsed_ratios[key] = val

    row_match_raw = raw.get("row_match")
    if not isinstance(row_match_raw, dict):
        raise SupplyRatiosUnavailableError("supply_ratios.json is missing 'row_match' object.")

    parsed_row_match: dict[str, float] = {}
    for key in _REQUIRED_RESOURCES:
        if key not in row_match_raw or isinstance(row_match_raw[key], bool):
            raise SupplyRatiosUnavailableError(f"supply_ratios.json is missing row_match for {key}.")
        try:
            share = float(row_match_raw[key])
        except (TypeError, ValueError) as exc:
            raise SupplyRatiosUnavailableError(
                f"supply_ratios.json has non-numeric row_match for {key}."
            ) from exc
        if not math.isfinite(share) or share != 1.0:
            raise SupplyRatiosUnavailableError(
                f"supply_ratios.json row_match for {key} must equal 1.0 (got {share})."
            )
        parsed_row_match[key] = share

    parsed_intervals: dict[str, tuple[float, float]] = {}
    intervals_raw = raw.get("valid_interval")
    if isinstance(intervals_raw, dict):
        for key in _REQUIRED_RESOURCES:
            bounds = intervals_raw.get(key)
            if isinstance(bounds, list) and len(bounds) == 2:
                lo, hi = float(bounds[0]), float(bounds[1])
                if not (math.isfinite(lo) and math.isfinite(hi) and lo <= parsed_ratios[key] <= hi):
                    raise SupplyRatiosUnavailableError(
                        f"supply_ratios.json ratio for {key} lies outside valid_interval."
                    )
                parsed_intervals[key] = (lo, hi)

    method = str(
        raw.get("method")
        or "supply = round_half_up(c × dengue_cases); constants reproduce 31,320/31,320 rows"
    )
    return SupplyRatios(
        saline_bags=parsed_ratios["saline_bags"],
        diagnostic_kits=parsed_ratios["diagnostic_kits"],
        hospital_beds=parsed_ratios["hospital_beds"],
        dataset_sha256=dataset_sha,
        valid_interval=parsed_intervals,
        row_match=parsed_row_match,
        method=method,
    )


class ConfigSupplyRatioSource:
    """File-backed SupplyRatioSource with mtime-aware caching and SHA-256 / row_match validation."""

    def __init__(
        self,
        path: Path = DEFAULT_SUPPLY_RATIOS_PATH,
        *,
        expected_sha256: str = EXPECTED_ONSITE_SHA256,
    ) -> None:
        self._path = path
        self._expected_sha256 = expected_sha256
        self._cache_lock = RLock()
        self._cached_mtime: float | None = None
        self._cached_ratios: SupplyRatios | None = None

    def ratios(self) -> SupplyRatios:
        """Load, validate, and cache verified supply constants from config JSON."""
        if not self._path.is_file():
            raise SupplyRatiosUnavailableError(
                "supply_ratios.json not found; run npm run fit:supply to generate config."
            )
        try:
            mtime = self._path.stat().st_mtime
        except OSError as exc:
            raise SupplyRatiosUnavailableError("Unable to stat supply_ratios.json.") from exc

        with self._cache_lock:
            if self._cached_ratios is not None and self._cached_mtime == mtime:
                return self._cached_ratios
            try:
                raw = json.loads(self._path.read_text(encoding="utf-8"))
            except (OSError, ValueError) as exc:
                raise SupplyRatiosUnavailableError(
                    "supply_ratios.json is unreadable or invalid JSON."
                ) from exc
            validated = _parse_and_validate(raw, expected_sha256=self._expected_sha256)
            self._cached_mtime = mtime
            self._cached_ratios = validated
            return validated

    def clear_cache(self) -> None:
        with self._cache_lock:
            self._cached_mtime = None
            self._cached_ratios = None


def get_supply_ratio_source() -> ConfigSupplyRatioSource:
    """Return the process-wide cached SupplyRatioSource adapter."""
    global _singleton
    with _lock:
        if _singleton is None:
            _singleton = ConfigSupplyRatioSource()
        return _singleton


def check_supply_ratios_ready(source: ConfigSupplyRatioSource | None = None) -> bool:
    """Return True when config/supply_ratios.json loads with valid SHA-256 and row_match == 1.0."""
    adapter = source or get_supply_ratio_source()
    try:
        adapter.ratios()
    except Exception:  # noqa: BLE001
        return False
    return True


def reset_supply_ratio_cache() -> None:
    """Reset the singleton cache (primarily for tests)."""
    global _singleton
    with _lock:
        if _singleton is not None:
            _singleton.clear_cache()
        _singleton = None
