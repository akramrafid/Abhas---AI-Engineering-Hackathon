"""Anthropic Claude Haiku LLM adapter implementing app.ports.llm.LLM (AC-17, NFR-7).

Controls:
- Explicit connect (3 s) + read/total (`LLM_TIMEOUT_S`, default 20 s) timeout on the SDK client.
- `max_retries=0` on the SDK so our bounded retry loop (<= 2 retries with expo backoff + jitter,
  honouring Retry-After clamped <= 10 s) owns retries and traces every single attempt 1:1.
- Hard caps: `max_output_tokens <= 400`, input context <= 4,800 chars, daily budget <= $1/day.
- `FAULT_INJECT` tokens (`llm_timeout`, `llm_bad_json`, `llm_bad_numbers`) active ONLY when `APP_ENV=test`.
"""

from __future__ import annotations

import json
import logging
import re
import secrets
import time
from collections.abc import Mapping
from datetime import date
from typing import Any

import anthropic
import httpx
from anthropic.types import MessageParam

from app.core.config import Settings, active_faults, get_settings
from app.core.logging import request_id_var
from app.observability.metrics import OpsMetrics, get_ops_metrics
from app.observability.pricing import estimate_cost_usd
from app.observability.traces import LLMCallRecord, TraceSink
from app.ports.llm import BudgetExceededError, LLMResult, LLMUnavailableError
from app.ports.repositories import CallLog

logger = logging.getLogger("abhas.llm")

MAX_INPUT_CHARS = 4800
HARD_MAX_OUTPUT_TOKENS = 400
_RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})
_FENCE_RE = re.compile(r"^`{3}(?:json)?\s*|\s*`{3}$")


def _strip_code_fences(text: str) -> str:
    return _FENCE_RE.sub("", text.strip()).strip()


def _extract_trace_context(user: str) -> tuple[str | None, date | None, int | None, str]:
    match = re.search(r"<forecast_data>\s*(\{.*?\})\s*</forecast_data>", user, re.DOTALL)
    if not match:
        return None, None, None, "en"
    try:
        parsed = json.loads(match.group(1))
        wid = str(parsed["ward_id"]) if "ward_id" in parsed else None
        ow = date.fromisoformat(str(parsed["origin_week"])) if "origin_week" in parsed else None
        hor = int(parsed["horizon"]) if "horizon" in parsed else None
        lang = "bn" if str(parsed.get("language", "en")) == "bn" else "en"
        return wid, ow, hor, lang
    except (ValueError, KeyError, TypeError):
        return None, None, None, "en"


def _extract_text_from_response(resp: Any) -> str:
    content = getattr(resp, "content", None)
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            txt = getattr(block, "text", None)
            if txt is None and isinstance(block, Mapping):
                txt = block.get("text")
            if isinstance(txt, str):
                parts.append(txt)
        return "\n".join(parts)
    if isinstance(content, str):
        return content
    return ""


class AnthropicLLM:
    """Implements app.ports.llm.LLM over Anthropic Messages API with budget, retries, and tracing."""

    provider: str = "anthropic"

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        timeout_s: float | None = None,
        max_output_tokens: int | None = None,
        daily_budget_usd: float | None = None,
        call_log: CallLog | None = None,
        trace_sink: TraceSink | None = None,
        ops_metrics: OpsMetrics | None = None,
        settings: Settings | None = None,
        client: Any | None = None,
        retry_base_s: float | None = None,
        prompt_name: str = "advisory",
        prompt_version: str = "v1",
    ) -> None:
        cfg = settings or get_settings()
        self._settings = cfg
        self.model: str = model or cfg.llm_model
        self._timeout_s: float = float(timeout_s if timeout_s is not None else cfg.llm_timeout_s)
        self._max_output_cap: int = min(
            HARD_MAX_OUTPUT_TOKENS,
            int(max_output_tokens if max_output_tokens is not None else cfg.llm_max_output_tokens),
        )
        self._daily_budget_usd: float = float(
            daily_budget_usd if daily_budget_usd is not None else cfg.llm_daily_budget_usd
        )
        self._call_log = call_log
        self._trace_sink = trace_sink
        self._ops = ops_metrics or get_ops_metrics()
        self._retry_base_s: float = (
            float(retry_base_s) if retry_base_s is not None else (0.0 if cfg.app_env == "test" else 0.5)
        )
        self._prompt_name = prompt_name
        self._prompt_version = prompt_version

        key_val = (
            api_key
            if api_key is not None
            else (cfg.anthropic_api_key.get_secret_value() if cfg.anthropic_api_key else "")
        )
        if client is not None:
            self._client = client
            self._owns_client = False
        else:
            http_timeout = anthropic.Timeout(connect=3.0, read=self._timeout_s, write=5.0, pool=5.0)
            self._client = anthropic.Anthropic(
                api_key=key_val or "disabled",
                timeout=http_timeout,
                max_retries=0,
            )
            self._owns_client = True

    def close(self) -> None:
        if self._owns_client and hasattr(self._client, "close"):
            self._client.close()

    def _emit_trace(self, rec: LLMCallRecord) -> None:
        if self._trace_sink is not None:
            self._trace_sink.emit(rec)

    def _sleep_backoff(self, attempt: int, retry_after: str | None = None) -> None:
        if self._retry_base_s <= 0.0:
            return
        delay = self._retry_base_s * (3**attempt)
        jitter = (secrets.randbelow(1000) / 1000.0) * self._retry_base_s
        if retry_after is not None:
            try:
                delay = min(10.0, max(delay, float(retry_after)))
            except ValueError:
                pass
        time.sleep(min(10.0, delay + jitter))

    def _check_budget(
        self,
        est_in_tokens: int,
        max_tokens: int,
        ctx: tuple[str | None, date | None, int | None, str],
    ) -> None:
        call_log_spend = 0.0
        has_source = False
        if self._call_log is not None:
            has_source = True
            _calls_today, call_log_spend = self._call_log.today("llm")
        trace_spend = 0.0
        spend_reader = getattr(self._trace_sink, "today_spend_usd", None)
        if callable(spend_reader):
            has_source = True
            raw_spend = spend_reader()
            if isinstance(raw_spend, (int, float)):
                trace_spend = float(raw_spend)
        if not has_source:
            return
        spend_today = max(call_log_spend, trace_spend)
        est_cost = estimate_cost_usd(self.model, est_in_tokens, max_tokens)
        projected = spend_today + (est_cost if est_cost is not None else 0.003)
        if projected > self._daily_budget_usd:
            wid, ow, hor, lang = ctx
            self._emit_trace(
                LLMCallRecord(
                    request_id=request_id_var.get(),
                    route="/api/v1/advisory",
                    feature="advisory",
                    prompt_name=self._prompt_name,
                    prompt_version=self._prompt_version,
                    provider=self.provider,
                    model=self.model,
                    attempt=0,
                    fallback_used=True,
                    status="budget_blocked",
                    latency_ms=0.0,
                    tokens_in=0,
                    tokens_out=0,
                    cost_usd=0.0,
                    error_type="BudgetExceededError",
                    ward_id=wid,
                    origin_week=ow,
                    horizon=hor,
                    language=lang,
                )
            )
            raise BudgetExceededError(
                f"Daily LLM budget ${self._daily_budget_usd:.2f} reached (today=${spend_today:.4f})"
            )

    def _invoke_once(
        self,
        system: str,
        messages: list[MessageParam],
        max_tokens: int,
        attempt: int,
        ctx: tuple[str | None, date | None, int | None, str],
    ) -> tuple[str, int, int, float, float]:
        """Run one SDK call (or test-only fault injection) and emit exactly one LLMCallRecord."""
        wid, ow, hor, lang = ctx
        t0 = time.perf_counter()
        status = "ok"
        error_type: str | None = None
        in_tok: int | None = None
        out_tok: int | None = None
        cost: float | None = None

        faults = active_faults(self._settings)
        try:
            if "llm_timeout" in faults:
                raise httpx.TimeoutException("Simulated fault: llm_timeout")
            if "llm_bad_json" in faults:
                raw_text = "{headline: broken json"
                in_tok = max(1, len(system) // 4)
                out_tok = 8
                cost = estimate_cost_usd(self.model, in_tok, out_tok)
                latency_ms = round((time.perf_counter() - t0) * 1000.0, 3)
                return raw_text, in_tok, out_tok, float(cost or 0.0), latency_ms
            if "llm_bad_numbers" in faults:
                raw_text = json.dumps(
                    {
                        "headline": "999 cases expected immediately",
                        "summary": "Forecast projects 999 weekly cases with 999% surge.",
                        "actions": [{"action": "Inspect 999 sites", "when": "this week"}],
                    }
                )
                in_tok = max(1, len(system) // 4)
                out_tok = 32
                cost = estimate_cost_usd(self.model, in_tok, out_tok)
                latency_ms = round((time.perf_counter() - t0) * 1000.0, 3)
                return raw_text, in_tok, out_tok, float(cost or 0.0), latency_ms

            resp = self._client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=messages,
                timeout=self._timeout_s,
            )
            raw_text = _extract_text_from_response(resp)
            usage = getattr(resp, "usage", None)
            in_tok = int(getattr(usage, "input_tokens", 0) or 0)
            out_tok = int(getattr(usage, "output_tokens", 0) or 0)
            cost = estimate_cost_usd(self.model, in_tok, out_tok)
            latency_ms = round((time.perf_counter() - t0) * 1000.0, 3)
            return raw_text, in_tok, out_tok, float(cost or 0.0), latency_ms
        except (httpx.TimeoutException, anthropic.APITimeoutError) as exc:
            status = "timeout"
            error_type = type(exc).__name__
            raise
        except Exception as exc:  # noqa: BLE001
            status = "error"
            error_type = type(exc).__name__
            raise
        finally:
            elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 3)
            self._emit_trace(
                LLMCallRecord(
                    request_id=request_id_var.get(),
                    route="/api/v1/advisory",
                    feature="advisory",
                    prompt_name=self._prompt_name,
                    prompt_version=self._prompt_version,
                    provider=self.provider,
                    model=self.model,
                    attempt=attempt,
                    fallback_used=False,
                    status=status,
                    latency_ms=elapsed_ms,
                    tokens_in=in_tok,
                    tokens_out=out_tok,
                    cost_usd=cost,
                    error_type=error_type,
                    ward_id=wid,
                    origin_week=ow,
                    horizon=hor,
                    language=lang,
                )
            )
            self._ops.record_llm_event(call=True, error=(status != "ok"))
            if self._call_log is not None:
                try:
                    self._call_log.record(
                        "llm",
                        ok=(status == "ok"),
                        latency_ms=elapsed_ms,
                        cost_usd=float(cost or 0.0),
                        detail=f"model={self.model} status={status}",
                    )
                except Exception:  # noqa: BLE001
                    logger.warning("llm_call_log_write_failed", extra={"event": "llm_call_log_write_failed"})

    def _call_with_retries(
        self,
        system: str,
        messages: list[MessageParam],
        max_tokens: int,
        ctx: tuple[str | None, date | None, int | None, str],
        *,
        attempt_offset: int = 0,
    ) -> tuple[str, int, int, float, float]:
        last_exc: Exception | None = None
        for idx in range(3):  # initial attempt + max 2 retries
            attempt_no = attempt_offset + idx + 1
            try:
                return self._invoke_once(system, messages, max_tokens, attempt_no, ctx)
            except (httpx.TimeoutException, anthropic.APITimeoutError, anthropic.APIConnectionError) as exc:
                last_exc = exc
                if idx < 2:
                    self._sleep_backoff(idx)
                    continue
                break
            except anthropic.APIStatusError as exc:
                last_exc = exc
                status_code = getattr(exc, "status_code", 0)
                if status_code in _RETRYABLE_STATUS and idx < 2:
                    resp = getattr(exc, "response", None)
                    retry_after = resp.headers.get("retry-after") if resp is not None else None
                    self._sleep_backoff(idx, retry_after)
                    continue
                break
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                break

        raise LLMUnavailableError(f"Anthropic call failed: {type(last_exc).__name__}") from last_exc

    def complete_json(
        self,
        system: str,
        user: str,
        schema: Mapping[str, Any],
        max_output_tokens: int,
    ) -> LLMResult:
        """Complete a structured JSON call with budget gate, retries, and max 1 JSON repair attempt."""
        del schema
        capped_user = user[:MAX_INPUT_CHARS]
        capped_out = max(1, min(int(max_output_tokens), self._max_output_cap, HARD_MAX_OUTPUT_TOKENS))
        ctx = _extract_trace_context(capped_user)
        est_in_tokens = max(1, (len(system) + len(capped_user)) // 4)

        self._check_budget(est_in_tokens, capped_out, ctx)

        messages: list[MessageParam] = [{"role": "user", "content": capped_user}]
        raw_text, in_tok, out_tok, cost, latency_ms = self._call_with_retries(
            system, messages, capped_out, ctx, attempt_offset=0
        )

        try:
            parsed = json.loads(_strip_code_fences(raw_text))
            if isinstance(parsed, Mapping):
                return LLMResult(
                    data=dict(parsed),
                    model=self.model,
                    input_tokens=in_tok,
                    output_tokens=out_tok,
                    cost_usd=cost,
                    latency_ms=latency_ms,
                )
            parse_err = "Response JSON must be an object"
        except (ValueError, TypeError) as exc:
            parse_err = str(exc)[:160]

        # At most 1 JSON repair retry (re-checks budget first)
        self._check_budget(est_in_tokens + out_tok, capped_out, ctx)
        repair_messages: list[MessageParam] = [
            {"role": "user", "content": capped_user},
            {"role": "assistant", "content": raw_text[:600]},
            {
                "role": "user",
                "content": f"Your previous output was not valid JSON ({parse_err}). Return ONLY one valid JSON object.",
            },
        ]
        raw2, in2, out2, cost2, lat2 = self._call_with_retries(
            system, repair_messages, capped_out, ctx, attempt_offset=1
        )
        try:
            parsed2 = json.loads(_strip_code_fences(raw2))
            if isinstance(parsed2, Mapping):
                return LLMResult(
                    data=dict(parsed2),
                    model=self.model,
                    input_tokens=in_tok + in2,
                    output_tokens=out_tok + out2,
                    cost_usd=round(cost + cost2, 6),
                    latency_ms=round(latency_ms + lat2, 3),
                )
        except (ValueError, TypeError):
            pass

        wid, ow, hor, lang = ctx
        self._emit_trace(
            LLMCallRecord(
                request_id=request_id_var.get(),
                route="/api/v1/advisory",
                feature="advisory",
                prompt_name=self._prompt_name,
                prompt_version=self._prompt_version,
                provider=self.provider,
                model=self.model,
                attempt=2,
                fallback_used=True,
                status="validation_failed",
                latency_ms=round(latency_ms + lat2, 3),
                tokens_in=in_tok + in2,
                tokens_out=out_tok + out2,
                cost_usd=round(cost + cost2, 6),
                error_type="InvalidJSON",
                numbers_validated=False,
                ward_id=wid,
                origin_week=ow,
                horizon=hor,
                language=lang,
            )
        )
        raise LLMUnavailableError("LLM failed to produce valid JSON after repair retry")
