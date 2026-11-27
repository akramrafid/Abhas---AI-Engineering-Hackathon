"""Business logic for the plans decision-log vertical slice (framework-free; ADR-0016)."""

from __future__ import annotations

import json
import time
import uuid
from collections.abc import Callable
from typing import Any, cast

from app.core.errors import AppError
from app.core.run_meta import current_run_meta
from app.ports.repositories import PlanStore, StoredPlan
from app.shared.plan_registry import run as default_run_plan

from .schemas import (
    PlanComparison,
    PlanCreateRequest,
    PlanHeadline,
    PlanKind,
    PlanList,
    PlanMetricDiff,
    PlanRecord,
    PlanSummary,
)

HEADLINE_METRICS: tuple[str, ...] = (
    "stock_pct",
    "mean_fulfilment_pct",
    "critical_wards",
    "deficit_wards",
    "crews",
    "cases_prevented",
    "unroutable_patients",
    "notices",
)

PlanRunnerFn = Callable[[PlanKind, Any], tuple[dict[str, Any], dict[str, Any]]]


def _extract_scope(inputs_json: str) -> str | None:
    try:
        raw = json.loads(inputs_json)
    except Exception:
        return None
    if not isinstance(raw, dict):
        return None
    scope = raw.get("scope")
    if isinstance(scope, str) and scope.strip():
        return scope.strip()
    ward_ids = raw.get("ward_ids")
    if isinstance(ward_ids, list) and ward_ids:
        return f"{len(ward_ids)} wards"
    deployments = raw.get("deployments")
    if isinstance(deployments, list) and deployments:
        return f"{len(deployments)} wards"
    if raw.get("auto_crews") is not None:
        return "all"
    return None


def _stored_to_summary(row: StoredPlan) -> PlanSummary:
    return PlanSummary(
        id=row.id,
        kind=cast(PlanKind, row.kind),
        label=row.label,
        created_at=row.created_at,
        origin_week=row.origin_week,
        scope=_extract_scope(row.inputs_json),
        model_version=row.model_version,
        git_sha=row.git_sha,
        headline=PlanHeadline.model_validate_json(row.headline_json),
    )


class PlansService:
    """Executes operational runs via shared.plan_registry and persists append-only plan records."""

    def __init__(
        self,
        store: PlanStore | None = None,
        runner: PlanRunnerFn | None = None,
    ) -> None:
        self._store = store
        self._runner: PlanRunnerFn = runner or default_run_plan

    def _require_store(self) -> PlanStore:
        if self._store is None:
            raise NotImplementedError("PlansService requires a configured PlanStore adapter")
        return self._store

    def create(self, req: PlanCreateRequest) -> PlanRecord:
        store = self._require_store()
        started = time.perf_counter()
        try:
            outputs, headline_dict = self._runner(req.kind, req.request)
        except KeyError as exc:
            raise AppError(
                404,
                "unknown-plan-kind",
                "Unknown plan kind",
                f"No runner registered for plan kind {req.kind!r}",
            ) from exc
        solve_ms = round((time.perf_counter() - started) * 1000.0, 3)

        meta = current_run_meta()
        raw_model_version = outputs.get("model_version")
        model_version = (
            raw_model_version
            if isinstance(raw_model_version, str) and raw_model_version.strip()
            else meta.model_version
        )
        headline = PlanHeadline.model_validate(headline_dict)
        plan_id = str(uuid.uuid4())

        record = StoredPlan(
            id=plan_id,
            kind=req.kind,
            label=req.label,
            origin_week=req.request.origin_week,
            model_version=model_version,
            git_sha=meta.git_sha,
            data_as_of=meta.data_as_of,
            offline=meta.offline,
            created_at=meta.generated_at,
            inputs_json=req.request.model_dump_json(),
            outputs_json=json.dumps(outputs, default=str, sort_keys=True),
            headline_json=headline.model_dump_json(),
            solve_ms=solve_ms,
        )
        stored = store.save(record)

        return PlanRecord(
            model_version=stored.model_version,
            git_sha=stored.git_sha,
            data_as_of=stored.data_as_of,
            offline=stored.offline,
            generated_at=stored.created_at,
            id=stored.id,
            kind=req.kind,
            label=stored.label,
            created_at=stored.created_at,
            origin_week=stored.origin_week,
            inputs=req.request,
            outputs=outputs,
            headline=headline,
        )

    def list_plans(self, *, kind: PlanKind | None = None, limit: int = 20) -> PlanList:
        store = self._require_store()
        meta = current_run_meta()
        rows = store.list(kind=kind, limit=limit)
        summaries = [_stored_to_summary(row) for row in rows]
        return PlanList(
            model_version=meta.model_version,
            git_sha=meta.git_sha,
            data_as_of=meta.data_as_of,
            offline=meta.offline,
            generated_at=meta.generated_at,
            plans=summaries,
        )

    def compare(self, *, a_id: str, b_id: str) -> PlanComparison:
        store = self._require_store()
        row_a = store.get(a_id)
        if row_a is None:
            raise AppError(404, "unknown-plan", "Unknown plan", f"Plan {a_id} was not found")
        row_b = store.get(b_id)
        if row_b is None:
            raise AppError(404, "unknown-plan", "Unknown plan", f"Plan {b_id} was not found")

        summary_a = _stored_to_summary(row_a)
        summary_b = _stored_to_summary(row_b)
        diffs: list[PlanMetricDiff] = []
        for metric in HEADLINE_METRICS:
            va = getattr(summary_a.headline, metric)
            vb = getattr(summary_b.headline, metric)
            delta = round(float(vb) - float(va), 4) if (va is not None and vb is not None) else None
            diffs.append(PlanMetricDiff(metric=metric, a=va, b=vb, delta=delta))

        meta = current_run_meta()
        return PlanComparison(
            model_version=meta.model_version,
            git_sha=meta.git_sha,
            data_as_of=meta.data_as_of,
            offline=meta.offline,
            generated_at=meta.generated_at,
            a=summary_a,
            b=summary_b,
            diffs=diffs,
        )
