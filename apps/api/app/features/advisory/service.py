"""Business logic for the advisory vertical slice (framework-free, AC-17).

- Deterministic EN/BN template default when no LLM key is configured.
- Optional Claude Haiku structured JSON via `app.ports.llm.LLM` with versioned prompt file
  (`prompts/advisory_v1.md`), numeric grounding validator (ASCII + Bangla digits), max 1 repair retry,
  daily budget guard, and guaranteed template fallback.
- Caches responses by `(ward_id, origin_week, horizon, model_version, language)`.
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Mapping
from datetime import date
from pathlib import Path
from string import Template
from typing import Any, Literal, cast

from pydantic import BaseModel, Field, ValidationError

from app.core.logging import request_id_var
from app.core.types import Tier
from app.observability.metrics import OpsMetrics
from app.observability.traces import LLMCallRecord, TraceSink
from app.ports.llm import LLM, BudgetExceededError, LLMUnavailableError
from app.ports.repositories import PredictionCache
from app.shared.forecast_engine import ForecastEngine

from .schemas import AdvisoryAction, AdvisoryRequest, AdvisoryResponse
from .templates import render_template_advisory, validate_advisory_numbers

logger = logging.getLogger("abhas.advisory")

PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"
PROMPT_FILE = PROMPTS_DIR / "advisory_v1.md"
PROMPT_VERSION = "v1"


class _LLMAdvisoryPayload(BaseModel):
    headline: str = Field(min_length=1, max_length=160)
    summary: str = Field(min_length=1, max_length=800)
    actions: list[AdvisoryAction] = Field(min_length=1, max_length=5)


def load_advisory_prompt(language: Literal["en", "bn"], forecast_json: str) -> tuple[str, str]:
    """Load and render system + user blocks from versioned prompts/advisory_v1.md."""
    raw = PROMPT_FILE.read_text(encoding="utf-8")
    # Strip YAML frontmatter between leading --- markers
    if raw.startswith("---"):
        parts = raw.split("---", 2)
        body = parts[2].strip() if len(parts) >= 3 else raw
    else:
        body = raw
    sys_part, sep, user_part = body.partition("# User Payload")
    # Escape angle brackets in JSON string literals so untrusted values cannot break out of <forecast_data>.
    safe_json = forecast_json.replace("<", "\\u003c").replace(">", "\\u003e")
    sys_tmpl = Template(sys_part.replace("# System Instructions", "").strip())
    system_msg = sys_tmpl.safe_substitute(language=language, forecast_json=safe_json)
    user_tmpl = Template(user_part.strip() if sep else "<forecast_data>\n$forecast_json\n</forecast_data>")
    user_msg = user_tmpl.safe_substitute(language=language, forecast_json=safe_json)
    return system_msg, user_msg


def _advisory_cache_key(
    ward_id: str,
    origin_week: date,
    horizon: int,
    model_version: str,
    language: str,
    mode_tag: str,
) -> str:
    raw = f"adv:{ward_id}|{origin_week.isoformat()}|h{horizon}|{model_version}|{language}|{PROMPT_VERSION}|{mode_tag}"
    return "adv:" + hashlib.sha256(raw.encode("utf-8")).hexdigest()[:60]


class AdvisoryService:
    """Builds grounded EN/BN advisories from the forecast engine, using template or optional LLM."""

    def __init__(
        self,
        engine: ForecastEngine,
        cache: PredictionCache,
        llm: LLM | None = None,
        *,
        max_output_tokens: int = 400,
        trace_sink: TraceSink | None = None,
        ops_metrics: OpsMetrics | None = None,
    ) -> None:
        self._engine = engine
        self._cache = cache
        self._llm = llm
        self._max_output_tokens = min(400, max(1, int(max_output_tokens)))
        self._trace_sink = trace_sink
        self._ops = ops_metrics

    def _emit_validation_failure(self, req: AdvisoryRequest, model_name: str, reason: str) -> None:
        if self._ops is not None:
            self._ops.record_llm_event(error=True)
        if self._trace_sink is None:
            return
        self._trace_sink.emit(
            LLMCallRecord(
                request_id=request_id_var.get(),
                route="/api/v1/advisory",
                feature="advisory",
                prompt_name="advisory",
                prompt_version=PROMPT_VERSION,
                provider="anthropic",
                model=model_name,
                attempt=2,
                fallback_used=True,
                status="validation_failed",
                latency_ms=0.0,
                tokens_in=0,
                tokens_out=0,
                cost_usd=0.0,
                error_type=reason,
                numbers_validated=False,
                ward_id=req.ward_id,
                origin_week=req.origin_week,
                horizon=req.horizon,
                language=req.language,
            )
        )

    def _try_llm(
        self,
        req: AdvisoryRequest,
        forecast_input: Mapping[str, Any],
        forecast_json: str,
    ) -> tuple[_LLMAdvisoryPayload, str] | None:
        assert self._llm is not None
        system_msg, user_msg = load_advisory_prompt(req.language, forecast_json)
        schema = _LLMAdvisoryPayload.model_json_schema()

        try:
            res = self._llm.complete_json(system_msg, user_msg, schema, self._max_output_tokens)
        except (BudgetExceededError, LLMUnavailableError) as exc:
            logger.info(
                "advisory_llm_fallback: %s",
                type(exc).__name__,
                extra={"event": "advisory_llm_fallback"},
            )
            return None

        # Validate Pydantic schema AND strict numeric grounding (ASCII + Bangla digits)
        repair_reason: str | None = None
        try:
            validated = _LLMAdvisoryPayload.model_validate(res.data)
            nums_ok, offending = validate_advisory_numbers(res.data, forecast_json)
            if nums_ok:
                return validated, res.model
            repair_reason = f"Ungrounded numbers found: {', '.join(offending[:8])}. Use ONLY numbers from <forecast_data>."
        except ValidationError as exc:
            repair_reason = f"Schema validation error: {exc.errors()[:3]}"

        # At most 1 repair retry for schema / ungrounded numbers
        repair_user = (
            f"{user_msg}\n\n"
            f"CORRECTION REQUIRED: {repair_reason} Return ONLY valid JSON with zero invented numbers."
        )
        try:
            res2 = self._llm.complete_json(system_msg, repair_user, schema, self._max_output_tokens)
            validated2 = _LLMAdvisoryPayload.model_validate(res2.data)
            nums_ok2, offending2 = validate_advisory_numbers(res2.data, forecast_json)
            if nums_ok2:
                return validated2, res2.model
            self._emit_validation_failure(req, res2.model, f"UngroundedNumbers:{','.join(offending2[:4])}")
        except (BudgetExceededError, LLMUnavailableError, ValidationError) as exc:
            self._emit_validation_failure(req, self._llm.model, type(exc).__name__)
        return None

    def advisory(self, req: AdvisoryRequest) -> AdvisoryResponse:
        batch = self._engine.forecast(
            ward_ids=[req.ward_id],
            origin_week=req.origin_week,
            horizons=[req.horizon],
            source="dataset",
        )
        wf = batch.forecasts[0]
        hf = wf.horizons[0]

        mode_tag = f"llm:{self._llm.model}" if self._llm is not None else "template"
        cache_key = _advisory_cache_key(
            req.ward_id,
            req.origin_week,
            req.horizon,
            batch.model_version,
            req.language,
            mode_tag,
        )

        # Cache lookup (never re-call LLM on cache hit)
        try:
            cached_raw = self._cache.get(cache_key)
        except Exception:  # noqa: BLE001
            cached_raw = None

        if cached_raw is not None:
            try:
                cached_obj = AdvisoryResponse.model_validate_json(cached_raw)
                if self._ops is not None:
                    self._ops.record_llm_event(cache_hit=True)
                return cached_obj.model_copy(update={"cached": True})
            except ValidationError:
                pass

        forecast_input: dict[str, Any] = {
            "ward_id": wf.ward_id,
            "city": wf.city,
            "origin_week": req.origin_week.isoformat(),
            "horizon": hf.horizon,
            "target_week": hf.target_week.isoformat(),
            "language": req.language,
            "tier": hf.tier,
            "tier_escalated": hf.tier_escalated,
            "expected_cases": round(hf.expected_cases, 1),
            "p10": round(hf.p10, 1),
            "p90": round(hf.p90, 1),
            "confidence_band_pct": 80,
            "risk_score": hf.risk_score,
            "drivers": [
                {
                    "key": d.key,
                    "label": d.label,
                    "effect_pct": round(d.effect_pct, 1),
                    "direction": d.direction,
                }
                for d in hf.drivers
            ],
        }
        forecast_json = json.dumps(forecast_input, ensure_ascii=False, sort_keys=True)

        source: Literal["template", "llm"] = "template"
        model_used: str | None = None
        payload: _LLMAdvisoryPayload | None = None

        if self._llm is not None:
            llm_out = self._try_llm(req, forecast_input, forecast_json)
            if llm_out is not None:
                payload, model_used = llm_out
                source = "llm"

        if payload is None:
            tpl = render_template_advisory(forecast_input, language=req.language)
            payload = _LLMAdvisoryPayload.model_validate(tpl)
            source = "template"
            model_used = None

        nums_valid, _ = validate_advisory_numbers(payload.model_dump(), forecast_json)

        response = AdvisoryResponse(
            ward_id=req.ward_id,
            origin_week=req.origin_week,
            horizon=req.horizon,
            language=req.language,
            tier=cast(Tier, hf.tier),
            headline=payload.headline,
            summary=payload.summary,
            actions=payload.actions,
            source=source,
            model=model_used,
            cached=False,
            numbers_validated=nums_valid,
        )

        # Persist cache only when response is clean (and avoid caching transient LLM fallback as llm key)
        if self._llm is None or source == "llm":
            try:
                self._cache.put(cache_key, response.model_dump_json())
            except Exception:  # noqa: BLE001
                logger.warning("advisory_cache_write_failed", extra={"event": "advisory_cache_write_failed"})

        return response
