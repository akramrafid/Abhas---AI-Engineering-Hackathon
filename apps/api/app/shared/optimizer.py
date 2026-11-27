"""Pure constrained-allocation LP, rounding, deficit classification, and greedy crew assignment.

Contracts §4; ADR-0010 (HiGHS weighted LP) and ADR-0011 (greedy marginal crews).
Allocation functions are implemented in WP1; ``greedy_crews`` remains stubbed for WP3.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from fractions import Fraction
from typing import Literal

import numpy as np
from scipy.optimize import linprog

DeficitLevel = Literal["none", "deficit", "critical"]

TIER_WEIGHTS: Mapping[str, float] = {
    "Low": 1.0,
    "Medium": 2.0,
    "High": 4.0,
    "Critical": 8.0,
}

_RESOURCE_ORDER: tuple[str, ...] = ("saline_bags", "diagnostic_kits", "hospital_beds")
_RESOURCE_LABELS: Mapping[str, str] = {
    "saline_bags": "Saline bags",
    "diagnostic_kits": "Diagnostic kits",
    "hospital_beds": "Hospital beds",
}
_HIGH_RISK_TIERS = frozenset({"High", "Critical"})


class InfeasibleAllocationError(ValueError):
    """Raised only if HiGHS reports infeasibility after equity floor scaling (maps to HTTP 409)."""


@dataclass(frozen=True)
class AllocationResult:
    """Integer per-ward allocations for one city and one resource from HiGHS LP + rounding."""

    allocated: list[int]
    floors_scaled: bool


@dataclass(frozen=True)
class CrewAssignmentResult:
    """Greedy marginal spraying-crew placement per ward and concavity flag (ADR-0011)."""

    crews: dict[str, int]
    approximate: bool = False


def available_stock(total_demand: int, stock_pct: int) -> int:
    """Compute available regional stock ``S = round_half_up(stock_pct / 100 * sum(demand))`` (ADR-0010)."""
    if total_demand < 0:
        raise ValueError(f"total_demand must be non-negative, got {total_demand}")
    if stock_pct < 0 or stock_pct > 100:
        raise ValueError(f"stock_pct must be in [0, 100], got {stock_pct}")
    return (stock_pct * total_demand + 50) // 100


def density_factors(densities: Sequence[float], city_median: float) -> list[float]:
    """Compute clipped density multipliers ``clip(density / city_median, 0.5, 2.0)``."""
    med = float(city_median)
    if not math.isfinite(med) or med <= 0.0:
        return [1.0 for _ in densities]
    out: list[float] = []
    for raw_d in densities:
        d = float(raw_d)
        if not math.isfinite(d) or d < 0.0:
            raise ValueError(f"density must be finite and non-negative, got {raw_d!r}")
        ratio = d / med
        out.append(max(0.5, min(2.0, ratio)))
    return out


def priority_weights(tiers: Sequence[str], density_factors: Sequence[float]) -> list[float]:
    """Compute priority weights ``tier_weight * density_factor`` (Low 1, Medium 2, High 4, Critical 8)."""
    if len(tiers) != len(density_factors):
        raise ValueError(
            f"tiers ({len(tiers)}) and density_factors ({len(density_factors)}) must have the same length"
        )
    out: list[float] = []
    for tier, factor_raw in zip(tiers, density_factors, strict=True):
        if tier not in TIER_WEIGHTS:
            raise ValueError(f"Unknown risk tier: {tier!r}")
        factor = float(factor_raw)
        if not math.isfinite(factor) or factor <= 0.0:
            raise ValueError(f"density_factor must be finite and positive, got {factor_raw!r}")
        out.append(float(TIER_WEIGHTS[tier]) * factor)
    return out


def largest_remainder_round(
    values: Sequence[float],
    total: int,
    ward_ids: Sequence[str],
    *,
    upper_bounds: Sequence[int] | None = None,
) -> list[int]:
    """Round non-negative floats to integers summing exactly to ``total`` (ties broken by ``ward_id``)."""
    n = len(values)
    if len(ward_ids) != n:
        raise ValueError(f"values ({n}) and ward_ids ({len(ward_ids)}) must have the same length")
    if upper_bounds is not None and len(upper_bounds) != n:
        raise ValueError(f"upper_bounds ({len(upper_bounds)}) must match values ({n})")
    if isinstance(total, bool) or not isinstance(total, int) or total < 0:
        raise ValueError(f"total must be a non-negative integer, got {total!r}")
    if n == 0:
        if total != 0:
            raise ValueError(f"Cannot distribute total={total} across 0 wards")
        return []

    bounds = [int(b) for b in upper_bounds] if upper_bounds is not None else None
    if bounds is not None:
        if any(b < 0 for b in bounds):
            raise ValueError("upper_bounds must be non-negative")
        if total > sum(bounds):
            raise ValueError(f"total ({total}) exceeds sum of upper_bounds ({sum(bounds)})")

    if total == 0:
        return [0] * n

    snapped: list[float] = []
    for idx, raw_v in enumerate(values):
        v = float(raw_v)
        if not math.isfinite(v) or v < -1e-9:
            raise ValueError(f"values must be finite and non-negative, got {raw_v!r}")
        v = max(0.0, v)
        if bounds is not None:
            v = min(v, float(bounds[idx]))
        nearest = round(v)
        if abs(v - nearest) <= 1e-9:
            v = float(nearest)
        snapped.append(v)

    result = [int(math.floor(v)) for v in snapped]
    remainders = [round(v - f, 9) for v, f in zip(snapped, result, strict=True)]

    diff = total - sum(result)
    if diff > 0:
        while diff > 0:
            eligible = [i for i in range(n) if bounds is None or result[i] < bounds[i]]
            if not eligible:
                raise ValueError(f"Cannot reach total={total} without exceeding upper_bounds")
            eligible.sort(key=lambda i: (-remainders[i], ward_ids[i]))
            take = min(diff, len(eligible))
            for i in eligible[:take]:
                result[i] += 1
            diff -= take
    elif diff < 0:
        # Sort by smallest remainder first, breaking ties by ward_id descending so ascending ward_id keeps priority.
        to_remove = -diff
        while to_remove > 0:
            eligible = [i for i in range(n) if result[i] > 0]
            if not eligible:
                raise ValueError(f"Cannot reduce floors to total={total}")
            eligible.sort(key=lambda i: ward_ids[i], reverse=True)
            eligible.sort(key=lambda i: remainders[i])
            take = min(to_remove, len(eligible))
            for i in eligible[:take]:
                result[i] -= 1
            to_remove -= take

    return result


def _effective_objective_weights(
    weights_sorted: Sequence[float],
    ward_ids_sorted: Sequence[str],
) -> np.ndarray:
    """Build strictly ordered LP weights breaking ties deterministically by ``ward_id`` ascending."""
    n = len(weights_sorted)
    w_arr = np.asarray(weights_sorted, dtype=np.float64)
    distinct = sorted(set(float(w) for w in weights_sorted))
    max_w = float(np.max(w_arr))
    min_gap = min(b - a for a, b in zip(distinct, distinct[1:], strict=False)) if len(distinct) > 1 else max_w

    if min_gap >= 1e-4 * max(max_w, 1.0):
        # Tiny deterministic tie-breaker well above HiGHS dual tolerance (1e-7) yet far below min_gap.
        eps = min(1e-5 * max(max_w, 1.0), min_gap / (2.0 * n + 2.0))
        tie_bonus = np.array([eps * (n - k) for k in range(n)], dtype=np.float64)
        return w_arr + tie_bonus

    # Pathological near-tied floats: preserve exact ordinal ranking without HiGHS tolerance collapse.
    # For a single-budget box LP (sum x_i <= S, l_i <= x_i <= d_i), any positive objective with the
    # same strict ordering induces the exact same unique optimal vertex.
    priority_order = sorted(range(n), key=lambda k: (-weights_sorted[k], ward_ids_sorted[k]))
    ranked = np.empty(n, dtype=np.float64)
    for rank, k in enumerate(priority_order):
        ranked[k] = 1.0 + float(n - rank) / float(n)
    return ranked


def _apportion_dhondt(
    floors_ord: Sequence[int],
    weights_ord: Sequence[float],
    ward_ids_ord: Sequence[str],
    target_total: int,
) -> list[int]:
    """Apportion ``target_total`` units over integer floors using house-monotone D'Hondt / Jefferson."""
    n = len(floors_ord)
    x_ord = [0] * n
    for _ in range(target_total):
        best_k = min(
            (k for k in range(n) if x_ord[k] < floors_ord[k]),
            key=lambda k: (-Fraction(floors_ord[k], x_ord[k] + 1), -weights_ord[k], ward_ids_ord[k]),
        )
        x_ord[best_k] += 1
    return x_ord


def _solve_city_integer_allocation(
    demand: Sequence[int],
    weights: Sequence[float],
    stock_pct: int,
    floor_pct: int,
    ward_ids: Sequence[str],
) -> tuple[list[int], bool]:
    """Solve integer-optimal, stock-monotone city allocation in canonical ``ward_id`` order."""
    n = len(demand)
    if len(weights) != n or len(ward_ids) != n:
        raise ValueError("demand, weights, and ward_ids must have the same length")
    if stock_pct < 0 or stock_pct > 100:
        raise ValueError(f"stock_pct must be in [0, 100], got {stock_pct}")
    if floor_pct < 0 or floor_pct > 100:
        raise ValueError(f"floor_pct must be in [0, 100], got {floor_pct}")
    if len(set(ward_ids)) != n:
        raise ValueError("ward_ids must be unique within a city")

    demand_ints = [int(d) for d in demand]
    weight_floats = [float(w) for w in weights]
    if any(d < 0 for d in demand_ints):
        raise ValueError("demand values must be non-negative")
    if any(not math.isfinite(w) or w <= 0.0 for w in weight_floats):
        raise ValueError("weights must be finite and strictly positive")

    if n == 0:
        return [], False

    total_demand = sum(demand_ints)
    avail = available_stock(total_demand, stock_pct)
    target_total = min(avail, total_demand)

    if total_demand == 0:
        return [0] * n, False
    if target_total == 0:
        return [0] * n, floor_pct > 0

    # Canonical ordering by ward_id guarantees strict permutation invariance.
    order = sorted(range(n), key=lambda i: ward_ids[i])
    d_ord = [demand_ints[i] for i in order]
    w_ord = [weight_floats[i] for i in order]
    ids_ord = [ward_ids[i] for i in order]

    # Ceiling integer floors: f_i = min(d_i, ceil(floor_pct * d_i / 100)).
    floors = [min(d, (floor_pct * d + 99) // 100) for d in d_ord]
    floor_sum = sum(floors)

    if floor_sum > target_total:
        x_ord = _apportion_dhondt(floors, w_ord, ids_ord, target_total)
        floors_scaled = True
    else:
        eff_weights = _effective_objective_weights(w_ord, ids_ord)
        c = -eff_weights
        a_ub = np.ones((1, n), dtype=np.float64)
        b_ub = np.array([float(target_total)], dtype=np.float64)
        bounds = [(float(floors[k]), float(d_ord[k])) for k in range(n)]

        res = linprog(c=c, A_ub=a_ub, b_ub=b_ub, bounds=bounds, method="highs")
        if not res.success or res.x is None:
            raise InfeasibleAllocationError(f"HiGHS allocation LP failed: {res.message}")

        x_ord = []
        for k in range(n):
            raw_v = float(res.x[k])
            snapped = int(round(raw_v))
            if abs(raw_v - snapped) > 1e-6:
                raise InfeasibleAllocationError(
                    f"HiGHS LP vertex for {ids_ord[k]} was non-integral: {raw_v!r}"
                )
            if snapped < floors[k] or snapped > d_ord[k]:
                raise InfeasibleAllocationError(
                    f"HiGHS LP solution for {ids_ord[k]} violated bounds [{floors[k]}, {d_ord[k]}]: {snapped}"
                )
            x_ord.append(snapped)
        if sum(x_ord) != target_total:
            raise InfeasibleAllocationError(
                f"HiGHS LP sum ({sum(x_ord)}) did not match target stock ({target_total})"
            )
        floors_scaled = False

    x_orig = [0] * n
    for k, orig_idx in enumerate(order):
        x_orig[orig_idx] = x_ord[k]
    return x_orig, floors_scaled


def allocate_city(
    demand: Sequence[int],
    weights: Sequence[float],
    stock_pct: int,
    floor_pct: int,
    ward_ids: Sequence[str],
) -> AllocationResult:
    """Allocate scarce regional stock inside one city using an integral HiGHS linear programme.

    Invariants:
    - ``S = (stock_pct * sum(demand) + 50) // 100`` (integer round-half-up).
    - Ceiling integer equity floors ``f_i = min(d_i, ceil(floor_pct * d_i / 100))``; when
      ``sum(f_i) <= T = min(S, sum(d))``, HiGHS solves an integral-vertex box-constrained LP;
      when ``sum(f_i) > T``, D'Hondt apportionment allocates ``T`` units monotonically and sets
      ``floors_scaled = True``.
    - ``sum(allocated) == min(S, sum(demand))``, ``0 <= allocated[i] <= demand[i]``, strictly
      monotone in ``stock_pct``, integer-optimal for ``sum(f_i) <= T``, and permutation-invariant.
    """
    allocated, floors_scaled = _solve_city_integer_allocation(
        demand=demand,
        weights=weights,
        stock_pct=stock_pct,
        floor_pct=floor_pct,
        ward_ids=ward_ids,
    )
    return AllocationResult(allocated=allocated, floors_scaled=floors_scaled)


def _classify_single_line(
    req: int,
    alloc: int,
    tier: str,
    label: str | None,
) -> tuple[DeficitLevel, str | None]:
    if req < 0 or alloc < 0:
        raise ValueError(f"required ({req}) and allocated ({alloc}) must be non-negative")
    if req == 0 or alloc >= req:
        return "none", None

    shortfall = req - alloc
    fulfil_pct = (alloc / req) * 100.0
    below_half = (2 * alloc) < req
    high_risk = tier in _HIGH_RISK_TIERS
    prefix = f"{label}: " if label is not None else ""

    if high_risk and below_half:
        return (
            "critical",
            f"{prefix}{tier}-tier ward below 50% fulfilment ({alloc}/{req}, {fulfil_pct:.1f}%, short {shortfall})",
        )
    if high_risk:
        return (
            "critical",
            f"{prefix}{tier}-tier ward below 100% fulfilment ({alloc}/{req}, {fulfil_pct:.1f}%, short {shortfall})",
        )
    if below_half:
        return (
            "critical",
            f"{prefix}fulfilment below 50% ({alloc}/{req}, {fulfil_pct:.1f}%, short {shortfall})",
        )
    return (
        "deficit",
        f"{prefix}supply shortfall ({alloc}/{req}, {fulfil_pct:.1f}%, short {shortfall})",
    )


def classify_deficit(
    required: int | Mapping[str, int],
    allocated: int | Mapping[str, int],
    tier: str,
) -> tuple[DeficitLevel, list[str]]:
    """Classify ward deficit severity and human-readable reasons per ADR-0010.

    Rule:
    - ``critical`` when ``(tier in {"High", "Critical"} and allocated < required)``
      or fulfilment ``< 50 %`` for any resource.
    - ``deficit`` when ``allocated < required`` for any resource without meeting the critical rule.
    - ``none`` when every resource meets its required demand.
    """
    if isinstance(required, Mapping) and isinstance(allocated, Mapping):
        req_keys = set(required.keys())
        alloc_keys = set(allocated.keys())
        if req_keys != alloc_keys:
            raise ValueError("required and allocated mappings must have identical resource keys")

        ordered_keys = [k for k in _RESOURCE_ORDER if k in req_keys] + sorted(req_keys - set(_RESOURCE_ORDER))
        level: DeficitLevel = "none"
        reasons: list[str] = []
        for key in ordered_keys:
            label = _RESOURCE_LABELS.get(key, key.replace("_", " ").capitalize())
            line_level, reason = _classify_single_line(int(required[key]), int(allocated[key]), tier, label)
            if reason is not None:
                reasons.append(reason)
            if line_level == "critical":
                level = "critical"
            elif line_level == "deficit" and level == "none":
                level = "deficit"
        return level, reasons

    if isinstance(required, int) and isinstance(allocated, int):
        if isinstance(required, bool) or isinstance(allocated, bool):
            raise TypeError("required and allocated must be integers or resource mappings")
        line_level, reason = _classify_single_line(required, allocated, tier, None)
        return line_level, ([reason] if reason is not None else [])

    raise TypeError("required and allocated must both be int or both be Mapping[str, int]")


def greedy_crews(
    marginal_fn: Callable[[str, int], float],
    wards: Sequence[str],
    total_crews: int,
    cap: int = 5,
    *,
    weights: Mapping[str, float] | None = None,
) -> CrewAssignmentResult:
    """Assign spraying crews one by one to the ward with highest marginal cases prevented (ADR-0011).

    Invariants:
    - Exact optimum when every ward's marginal benefit sequence is non-increasing;
      sets ``approximate=True`` if a non-concave marginal step is detected.
    - Total crews assigned equals ``min(total_crews, len(wards) * cap)``.
    - Ties break by priority weight descending, then ``ward_id`` ascending.
    """
    if isinstance(total_crews, bool) or not isinstance(total_crews, int) or total_crews < 0:
        raise ValueError(f"total_crews must be a non-negative integer, got {total_crews!r}")
    if isinstance(cap, bool) or not isinstance(cap, int) or cap < 1:
        raise ValueError(f"cap must be a positive integer, got {cap!r}")

    unique_wards = list(dict.fromkeys(str(w) for w in wards))
    crews: dict[str, int] = {w: 0 for w in unique_wards}
    steps = min(total_crews, len(unique_wards) * cap)
    if steps == 0:
        return CrewAssignmentResult(crews=crews, approximate=False)

    weight_map = {str(k): float(v) for k, v in (weights or {}).items()}
    next_marginal: dict[str, float] = {w: float(marginal_fn(w, 1)) for w in unique_wards}
    prev_marginal: dict[str, float] = {}
    approximate = False

    for step_idx in range(steps):
        eligible = [w for w in unique_wards if crews[w] < cap]
        best_w = min(
            eligible,
            key=lambda w: (-round(next_marginal[w], 12), -weight_map.get(w, 0.0), w),
        )
        chosen_m = next_marginal[best_w]
        if best_w in prev_marginal and chosen_m > prev_marginal[best_w] + 1e-9:
            approximate = True
        prev_marginal[best_w] = chosen_m
        crews[best_w] += 1

        if crews[best_w] < cap and (step_idx + 1) < steps:
            nxt_m = float(marginal_fn(best_w, crews[best_w] + 1))
            if nxt_m > chosen_m + 1e-9:
                approximate = True
            next_marginal[best_w] = nxt_m

    return CrewAssignmentResult(crews=crews, approximate=approximate)
