"""Pure intra-city hospital overflow routing and bed capacity derivation (contracts §4; ADR-0012).

Pure, deterministic, offline algorithms using NumPy and SciPy HiGHS only.
"""

from __future__ import annotations

import heapq
import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from fractions import Fraction
from typing import Any, cast

import numpy as np
import pandas as pd
from scipy.optimize import Bounds, LinearConstraint, milp
from scipy.sparse import csc_matrix

_STAGE2_SMALL_ARC_THRESHOLD = 36
_STAGE2_NODE_LIMIT = 1500
_UTIL_EPS = 1e-9


@dataclass(frozen=True)
class TransferArc:
    """Directed intra-city patient transfer from a deficit ward to a headroom ward."""

    from_ward: str
    to_ward: str
    patients: int


@dataclass(frozen=True)
class RoutingResult:
    """Result of two-stage intra-city overflow routing (min-max utilisation + min-arcs MILP)."""

    transfers: list[TransferArc]
    loads: list[int]
    u_star: float


@dataclass(frozen=True)
class CityBedStats:
    """City-level bed utilisation and overflow summary fields matching CityBedSummary (§2.2)."""

    capacity_total: int
    required_total: int
    utilisation_before: float
    utilisation_after: float
    headroom_after: int
    unroutable_patients: int
    transfers: int


def derive_capacity(
    beds_history: Mapping[str, Sequence[tuple[int, float]]] | pd.DataFrame,
    years: tuple[int, int] = (2016, 2022),
    q: float = 0.95,
    margin: float = 1.10,
    minimum: int = 1,
) -> dict[str, int]:
    """Derive per-ward baseline bed capacities ``max(minimum, ceil(margin * quantile_q))`` on training years only."""
    y_start, y_end = int(years[0]), int(years[1])
    if y_start > y_end:
        raise ValueError(f"years start ({y_start}) must be <= end ({y_end})")
    if not (0.0 <= q <= 1.0):
        raise ValueError(f"quantile q must be in [0, 1], got {q}")
    if margin <= 0.0 or not math.isfinite(margin):
        raise ValueError(f"margin must be positive and finite, got {margin}")
    if minimum < 1:
        raise ValueError(f"minimum capacity must be >= 1, got {minimum}")

    capacities: dict[str, int] = {}

    if isinstance(beds_history, pd.DataFrame):
        if beds_history.empty:
            return {}
        if "ward_id" not in beds_history.columns:
            raise ValueError("DataFrame beds_history must include a 'ward_id' column")
        if "year" in beds_history.columns:
            year_series = pd.Series(pd.to_numeric(beds_history["year"], errors="raise")).astype(int)
        elif "date" in beds_history.columns:
            year_series = pd.to_datetime(beds_history["date"], errors="raise").dt.year
        elif "week" in beds_history.columns:
            year_series = pd.to_datetime(beds_history["week"], errors="raise").dt.year
        else:
            raise ValueError("DataFrame beds_history must include a 'year', 'date', or 'week' column")

        if "hospital_beds_required" in beds_history.columns:
            beds_col = "hospital_beds_required"
        elif "beds" in beds_history.columns:
            beds_col = "beds"
        else:
            raise ValueError(
                "DataFrame beds_history must include a 'hospital_beds_required' or 'beds' column"
            )

        mask = (year_series >= y_start) & (year_series <= y_end)
        train_df = beds_history.loc[mask]
        if train_df.empty:
            return {}

        for ward_id in sorted(str(w) for w in train_df["ward_id"].unique()):
            beds = train_df.loc[train_df["ward_id"] == ward_id, beds_col].to_numpy(dtype=np.float64)
            if beds.size == 0:
                continue
            p_val = float(np.quantile(beds, q))
            capacities[ward_id] = max(minimum, int(math.ceil(margin * p_val)))
        return capacities

    for ward_id in sorted(str(w) for w in beds_history.keys()):
        entries = beds_history[ward_id]
        vals = [float(beds) for yr, beds in entries if y_start <= int(yr) <= y_end]
        if not vals:
            continue
        arr = np.asarray(vals, dtype=np.float64)
        p_val = float(np.quantile(arr, q))
        capacities[ward_id] = max(minimum, int(math.ceil(margin * p_val)))
    return capacities


def _solve_stage1_min_max_util(
    r_def: Sequence[int],
    k_def: Sequence[int],
    d_def: Sequence[int],
    placed_star: int,
) -> tuple[list[int], float]:
    """Stage 1: exact discrete min-max post-transfer utilisation u* for placed_star transfers.

    Because the deficit-to-headroom graph is complete bipartite, any integer outflow vector
    ``0 <= out_p <= D_p`` with ``sum(out_p) == placed_star`` admits an exact integer arc flow into
    headroom wards. Repeatedly relieving one patient from the ward with highest exact utilisation
    ``Fraction(r_p - out_p, k_p)`` is provably optimal by exchange argument (any ward strictly
    above the optimal ``u*`` must be decremented in every optimal solution) and avoids solver
    presolve failures on degenerate instances.
    """
    m = len(r_def)
    if placed_star == sum(d_def):
        return list(d_def), 1.0

    out_sol = [0] * m
    # Max-heap by exact rational utilisation (negated for heapq min-heap), tie-break by ward index.
    heap: list[tuple[Fraction, int]] = [(-Fraction(r_def[p], k_def[p]), p) for p in range(m)]
    heapq.heapify(heap)

    for _ in range(placed_star):
        _neg_u, p = heapq.heappop(heap)
        out_sol[p] += 1
        if out_sol[p] < d_def[p]:
            heapq.heappush(heap, (-Fraction(r_def[p] - out_sol[p], k_def[p]), p))

    u_exact = max(Fraction(1, 1), max(Fraction(r_def[p] - out_sol[p], k_def[p]) for p in range(m)))
    return out_sol, float(u_exact)


def _northwest_corner_fallback(
    out_targets: Sequence[int],
    h_hdr: Sequence[int],
) -> list[tuple[int, int, int]]:
    """Deterministic integer bipartite flow decomposition used only if Stage 2 hits node limit without an incumbent."""
    rem_out = list(out_targets)
    rem_in = list(h_hdr)
    flows: list[tuple[int, int, int]] = []
    p = 0
    q = 0
    while p < len(rem_out) and q < len(rem_in):
        if rem_out[p] == 0:
            p += 1
            continue
        if rem_in[q] == 0:
            q += 1
            continue
        amt = min(rem_out[p], rem_in[q])
        flows.append((p, q, amt))
        rem_out[p] -= amt
        rem_in[q] -= amt
    return flows


def _solve_stage2_min_arcs(
    d_def: Sequence[int],
    min_out: Sequence[int],
    h_hdr: Sequence[int],
    placed_star: int,
    stage1_out: Sequence[int],
) -> list[tuple[int, int, int]]:
    """Stage 2 (HiGHS MILP): minimise active transfer arcs subject to exact placement and u <= u*."""
    m = len(d_def)
    h_cnt = len(h_hdr)
    total_h = sum(h_hdr)
    all_headroom_used = placed_star == total_h

    arcs: list[tuple[int, int]] = [(p, q) for p in range(m) for q in range(h_cnt)]
    n_arcs = len(arcs)
    n_vars = 2 * n_arcs  # [t_0..t_{E-1}, y_0..y_{E-1}]

    rows: list[int] = []
    cols: list[int] = []
    vals: list[float] = []
    lb_c: list[float] = []
    ub_c: list[float] = []
    row_idx = 0

    # 1. Per-deficit-ward outflow bounds: min_out[p] <= sum_q t_{p,q} <= D_p
    for p in range(m):
        for e, (pp, _qq) in enumerate(arcs):
            if pp == p:
                rows.append(row_idx)
                cols.append(e)
                vals.append(1.0)
        lb_c.append(float(min_out[p]))
        ub_c.append(float(d_def[p]))
        row_idx += 1

    # 2. Per-headroom-ward inflow bounds: (H_q if pool exhausted else 0) <= sum_p t_{p,q} <= H_q
    for q in range(h_cnt):
        for e, (_pp, qq) in enumerate(arcs):
            if qq == q:
                rows.append(row_idx)
                cols.append(e)
                vals.append(1.0)
        lb_c.append(float(h_hdr[q]) if all_headroom_used else 0.0)
        ub_c.append(float(h_hdr[q]))
        row_idx += 1

    # 3. Total routed patients == placed_star
    for e in range(n_arcs):
        rows.append(row_idx)
        cols.append(e)
        vals.append(1.0)
    lb_c.append(float(placed_star))
    ub_c.append(float(placed_star))
    row_idx += 1

    # 4. Tight big-M arc activation: y_e <= t_e <= min(D_p, H_q) * y_e
    ub_v = np.empty(n_vars, dtype=np.float64)
    for e, (p, q) in enumerate(arcs):
        cap = float(min(d_def[p], h_hdr[q]))
        ub_v[e] = cap
        ub_v[n_arcs + e] = 1.0

        # t_e - cap * y_e <= 0
        rows.extend([row_idx, row_idx])
        cols.extend([e, n_arcs + e])
        vals.extend([1.0, -cap])
        lb_c.append(-np.inf)
        ub_c.append(0.0)
        row_idx += 1

        # t_e - y_e >= 0
        rows.extend([row_idx, row_idx])
        cols.extend([e, n_arcs + e])
        vals.extend([1.0, -1.0])
        lb_c.append(0.0)
        ub_c.append(np.inf)
        row_idx += 1

    # 5. Valid degree lower-bound cuts tighten LP relaxation without cutting any integer solution
    for p in range(m):
        if min_out[p] > 0:
            for e, (pp, _qq) in enumerate(arcs):
                if pp == p:
                    rows.append(row_idx)
                    cols.append(n_arcs + e)
                    vals.append(1.0)
            lb_c.append(1.0)
            ub_c.append(float(h_cnt))
            row_idx += 1

    if all_headroom_used:
        for q in range(h_cnt):
            for e, (_pp, qq) in enumerate(arcs):
                if qq == q:
                    rows.append(row_idx)
                    cols.append(n_arcs + e)
                    vals.append(1.0)
            lb_c.append(1.0)
            ub_c.append(float(m))
            row_idx += 1

    a_mat = csc_matrix((vals, (rows, cols)), shape=(row_idx, n_vars))
    lb_v = np.zeros(n_vars, dtype=np.float64)
    integrality = np.ones(n_vars, dtype=int)

    # Objective: 1.0 per active arc + tiny canonical tie-breaker by (from_ward, to_ward) strictly < 0.06 << 1.0
    c = np.zeros(n_vars, dtype=np.float64)
    denom = n_arcs * (n_arcs + 1) / 2.0 + 1.0
    if n_arcs <= _STAGE2_SMALL_ARC_THRESHOLD:
        y_tie_scale = 0.05
        t_tie_scale = 0.001
    else:
        y_tie_scale = 1e-4
        t_tie_scale = 1e-6

    for e in range(n_arcs):
        c[n_arcs + e] = 1.0 + y_tie_scale * (e + 1) / denom
        c[e] = t_tie_scale * (e + 1) / (denom * (placed_star + 1.0))

    res = milp(
        c=c,
        integrality=integrality,
        bounds=Bounds(cast(Any, lb_v), cast(Any, ub_v)),
        constraints=LinearConstraint(a_mat, cast(Any, lb_c), cast(Any, ub_c)),
        options={"mip_rel_gap": 0.0, "node_limit": _STAGE2_NODE_LIMIT, "time_limit": 2.0},
    )
    if res.status == 4 or res.x is None:
        res = milp(
            c=c,
            integrality=integrality,
            bounds=Bounds(cast(Any, lb_v), cast(Any, ub_v)),
            constraints=LinearConstraint(a_mat, cast(Any, lb_c), cast(Any, ub_c)),
            options={"presolve": False, "node_limit": _STAGE2_NODE_LIMIT, "time_limit": 2.0},
        )

    if res.status == 2:
        raise RuntimeError(f"Stage 2 overflow MILP reported infeasibility ({res.message})")
    if res.x is None:
        return _northwest_corner_fallback(stage1_out, h_hdr)

    flows: list[tuple[int, int, int]] = []
    for e, (p, q) in enumerate(arcs):
        amt = int(round(float(res.x[e])))
        if amt >= 1:
            flows.append((p, q, amt))
    return flows


def route_city(
    required: Sequence[int],
    capacity: Sequence[int],
    ward_ids: Sequence[str],
) -> RoutingResult:
    """Route overflow patients strictly inside one city via two-stage min-max + min-arcs MILP (ADR-0012).

    Invariants:
    - Stage 1 minimises maximum post-transfer utilisation ``u`` while placing ``P* = min(sum D, sum H)``.
    - Stage 2 minimises the number of active transfer arcs subject to ``u <= u*`` and ``sum t == P*``.
    - Patients are conserved (sum transferred out == sum transferred in == P*); no self-arcs; no ward
      both sends and receives; deterministic and permutation-invariant for identical inputs.
    """
    n = len(ward_ids)
    if len(required) != n or len(capacity) != n:
        raise ValueError(f"Length mismatch: ward_ids={n}, required={len(required)}, capacity={len(capacity)}")
    if n == 0:
        return RoutingResult(transfers=[], loads=[], u_star=0.0)

    w_orig = [str(w) for w in ward_ids]
    if len(set(w_orig)) != n:
        raise ValueError("ward_ids must be unique within a city")

    r_orig = [int(x) for x in required]
    k_orig = [int(x) for x in capacity]
    if any(r < 0 for r in r_orig):
        raise ValueError("required beds must be >= 0 for every ward")
    if any(k < 1 for k in k_orig):
        raise ValueError("capacity must be >= 1 for every ward")

    # Canonical lexicographic ordering makes the HiGHS formulation strictly permutation-invariant.
    order = sorted(range(n), key=lambda idx: w_orig[idx])
    r_s = [r_orig[idx] for idx in order]
    k_s = [k_orig[idx] for idx in order]
    w_s = [w_orig[idx] for idx in order]

    deficits = [max(r_s[i] - k_s[i], 0) for i in range(n)]
    headrooms = [max(k_s[j] - r_s[j], 0) for j in range(n)]
    def_indices = [i for i in range(n) if deficits[i] > 0]
    hdr_indices = [j for j in range(n) if headrooms[j] > 0]

    if not def_indices or not hdr_indices:
        u_star = max(r_s[i] / k_s[i] for i in range(n))
        return RoutingResult(transfers=[], loads=list(r_orig), u_star=float(u_star))

    r_def = [r_s[i] for i in def_indices]
    k_def = [k_s[i] for i in def_indices]
    d_def = [deficits[i] for i in def_indices]
    h_hdr = [headrooms[j] for j in hdr_indices]
    placed_star = min(sum(d_def), sum(h_hdr))

    stage1_out, u_star_s1 = _solve_stage1_min_max_util(r_def, k_def, d_def, placed_star)
    # Exact integer lower bound on outflow per deficit ward enforcing (r_i - out_i) / k_i <= u_star_s1
    min_out = [
        max(0, r_def[p] - int(math.floor(k_def[p] * u_star_s1 + _UTIL_EPS))) for p in range(len(def_indices))
    ]

    flows = _solve_stage2_min_arcs(d_def, min_out, h_hdr, placed_star, stage1_out)

    loads_s = list(r_s)
    transfers: list[TransferArc] = []
    total_moved = 0
    for p, q, amt in flows:
        i = def_indices[p]
        j = hdr_indices[q]
        loads_s[i] -= amt
        loads_s[j] += amt
        total_moved += amt
        transfers.append(TransferArc(from_ward=w_s[i], to_ward=w_s[j], patients=amt))

    if total_moved != placed_star:
        raise RuntimeError(f"Conservation check failed: moved {total_moved} != expected {placed_star}")

    transfers.sort(key=lambda arc: (arc.from_ward, arc.to_ward))

    # Map canonical loads back to caller's original ward_ids order.
    loads_orig = [0] * n
    for pos, orig_idx in enumerate(order):
        loads_orig[orig_idx] = loads_s[pos]

    u_star = max(loads_orig[i] / k_orig[i] for i in range(n))
    return RoutingResult(transfers=transfers, loads=loads_orig, u_star=float(u_star))


def summarise_city(
    required: Sequence[int],
    capacity: Sequence[int],
    loads: Sequence[int],
    *,
    transfers: int = 0,
) -> CityBedStats:
    """Compute city-level utilisation before/after, headroom after, and unroutable patients (§2.2)."""
    n = len(required)
    if len(capacity) != n or len(loads) != n:
        raise ValueError(f"Length mismatch: required={n}, capacity={len(capacity)}, loads={len(loads)}")
    if n == 0:
        raise ValueError("summarise_city requires at least one ward")

    req_vals = [int(r) for r in required]
    cap_vals = [int(c) for c in capacity]
    load_vals = [int(x) for x in loads]
    if any(r < 0 for r in req_vals) or any(x < 0 for x in load_vals):
        raise ValueError("required and loads must be >= 0")
    if any(c < 1 for c in cap_vals):
        raise ValueError("capacity must be >= 1 for every ward")

    capacity_total = sum(cap_vals)
    required_total = sum(req_vals)
    occupied_after = sum(min(load_v, cap_v) for load_v, cap_v in zip(load_vals, cap_vals, strict=True))
    headroom_after = sum(max(cap_v - load_v, 0) for load_v, cap_v in zip(load_vals, cap_vals, strict=True))
    unroutable_patients = sum(
        max(load_v - cap_v, 0) for load_v, cap_v in zip(load_vals, cap_vals, strict=True)
    )

    return CityBedStats(
        capacity_total=capacity_total,
        required_total=required_total,
        utilisation_before=required_total / capacity_total,
        utilisation_after=occupied_after / capacity_total,
        headroom_after=headroom_after,
        unroutable_patients=unroutable_patients,
        transfers=int(transfers),
    )
