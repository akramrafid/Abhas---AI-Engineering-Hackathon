"""Deterministic FakeLLM adapter implementing app.ports.llm.LLM for unit and tracing tests."""

from __future__ import annotations

import json
import re
import time
from collections.abc import Mapping
from datetime import date
from typing import Any, Literal

from app.core.logging import request_id_var
from app.features.advisory.templates import (
    DRIVER_BN_LABEL,
    TIER_BN_LABEL,
    extract_output_numbers,
    normalize_digits,
    render_template_advisory,
    to_bangla_digits,
    validate_advisory_numbers,
)
from app.observability.traces import LLMCallRecord, TraceSink
from app.ports.llm import LLMResult

__all__ = [
    "DRIVER_BN_LABEL",
    "FakeLLM",
    "TIER_BN_LABEL",
    "extract_output_numbers",
    "normalize_digits",
    "render_template_advisory",
    "to_bangla_digits",
    "validate_advisory_numbers",
]


class FakeLLM:
    """Deterministic fake implementing app.ports.llm.LLM for unit and tracing tests."""

    def __init__(
        self,
        *,
        model: str = "fake-llm-deterministic",
        trace_sink: TraceSink | None = None,
        override_payload: Mapping[str, Any] | None = None,
    ) -> None:
        self.model = model
        self._trace_sink = trace_sink
        self._override_payload = dict(override_payload) if override_payload is not None else None
        self.calls: int = 0

    def complete_json(
        self,
        system: str,
        user: str,
        schema: Mapping[str, Any],
        max_output_tokens: int,
    ) -> LLMResult:
        del schema, max_output_tokens
        t0 = time.perf_counter()
        self.calls += 1

        if self._override_payload is not None:
            data = dict(self._override_payload)
            lang: Literal["en", "bn"] = "en"
            wid: str | None = None
            ow: date | None = None
            hor: int | None = None
        else:
            # Parse JSON embedded in <forecast_data>...</forecast_data>
            match = re.search(r"<forecast_data>\s*(\{.*?\})\s*</forecast_data>", user, re.DOTALL)
            parsed = json.loads(match.group(1)) if match else {}
            raw_lang = str(parsed.get("language", "en"))
            lang = "bn" if raw_lang == "bn" else "en"
            wid = str(parsed["ward_id"]) if "ward_id" in parsed else None
            ow = date.fromisoformat(str(parsed["origin_week"])) if "origin_week" in parsed else None
            hor = int(parsed["horizon"]) if "horizon" in parsed else None
            data = render_template_advisory(parsed, language=lang)

        latency_ms = round((time.perf_counter() - t0) * 1000.0, 3)
        in_tok = max(1, (len(system) + len(user)) // 4)
        out_tok = max(1, len(json.dumps(data, ensure_ascii=False)) // 4)

        if self._trace_sink is not None:
            self._trace_sink.emit(
                LLMCallRecord(
                    request_id=request_id_var.get(),
                    route="/api/v1/advisory",
                    feature="advisory",
                    prompt_name="advisory",
                    prompt_version="v1",
                    provider="fake",
                    model=self.model,
                    attempt=1,
                    fallback_used=False,
                    status="ok",
                    latency_ms=latency_ms,
                    tokens_in=in_tok,
                    tokens_out=out_tok,
                    cost_usd=0.0,
                    cache_hit=False,
                    numbers_validated=True,
                    ward_id=wid,
                    origin_week=ow,
                    horizon=hor,
                    language=lang,
                )
            )

        return LLMResult(
            data=data,
            model=self.model,
            input_tokens=in_tok,
            output_tokens=out_tok,
            cost_usd=0.0,
            latency_ms=latency_ms,
        )
