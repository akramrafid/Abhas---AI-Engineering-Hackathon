"""Google Gemini REST adapter implementing app.ports.chat_llm.ChatLLM.

Controls:
- Sends key exclusively via `x-goog-api-key` header (never in URL query string).
- Persistent keep-alive `httpx.AsyncClient` with explicit connect (3 s) + read timeout for low latency.
- Uses `thinkingConfig: {"thinkingBudget": 0}` on Gemini 2.5 Flash so first token arrives in ~300 ms.
- Enforces hard output token cap, daily USD budget guard, bounded retry on 429/503, and LLMOps tracing.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator, Callable, Sequence
from typing import Any

import httpx

from app.core.config import Settings, get_settings
from app.core.logging import request_id_var
from app.core.offline import (
    DEFAULT_BREAKER_COOLDOWN_S,
    DEFAULT_BREAKER_THRESHOLD,
    DEFAULT_CONNECT_TIMEOUT_S,
    CircuitBreaker,
    is_offline,
)
from app.observability.metrics import OpsMetrics, get_ops_metrics
from app.observability.pricing import estimate_cost_usd
from app.observability.traces import LLMCallRecord, TraceSink
from app.ports.chat_llm import (
    ChatBudgetExceededError,
    ChatLLMResult,
    ChatLLMUnavailableError,
    ChatTurnInput,
)
from app.ports.repositories import CallLog

logger = logging.getLogger("abhas.chat.llm")

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
HARD_MAX_OUTPUT_TOKENS = 768
MAX_SYSTEM_CHARS = 9000
MAX_HISTORY_CHARS = 6000
_RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})


def _extract_gemini_text(payload: dict[str, Any]) -> str:
    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        return ""
    first = candidates[0]
    if not isinstance(first, dict):
        return ""
    content = first.get("content")
    if not isinstance(content, dict):
        return ""
    parts = content.get("parts")
    if not isinstance(parts, list):
        return ""
    chunks: list[str] = []
    for part in parts:
        if isinstance(part, dict) and isinstance(part.get("text"), str):
            chunks.append(part["text"])
    return "".join(chunks)


def _extract_gemini_usage(payload: dict[str, Any]) -> tuple[int, int]:
    meta = payload.get("usageMetadata")
    if not isinstance(meta, dict):
        return 0, 0
    in_tok = int(meta.get("promptTokenCount") or 0)
    out_tok = int(meta.get("candidatesTokenCount") or 0)
    return max(0, in_tok), max(0, out_tok)


class GeminiChatAdapter:
    """Fast, keep-alive Gemini Flash client implementing app.ports.chat_llm.ChatLLM."""

    provider: str = "google"

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
        client: httpx.AsyncClient | None = None,
        clock: Callable[[], float] | None = None,
        breaker_threshold: int = DEFAULT_BREAKER_THRESHOLD,
        breaker_cooldown_s: float = DEFAULT_BREAKER_COOLDOWN_S,
    ) -> None:
        cfg = settings or get_settings()
        self._settings = cfg
        self.model: str = (model or cfg.gemini_model).strip() or "gemini-2.5-flash"
        key_primary = (
            api_key
            if api_key is not None
            else (cfg.gemini_api_key.get_secret_value().strip() if cfg.gemini_api_key else "")
        )
        key_fallback = (
            cfg.gemini_api_key_fallback.get_secret_value().strip()
            if api_key is None and cfg.gemini_api_key_fallback
            else ""
        )
        self._api_keys: list[str] = [k for k in (key_primary, key_fallback) if k]
        self._api_key: str = self._api_keys[0] if self._api_keys else ""
        self._timeout_s: float = float(timeout_s if timeout_s is not None else cfg.gemini_timeout_s)
        self._max_output_cap: int = min(
            HARD_MAX_OUTPUT_TOKENS,
            int(max_output_tokens if max_output_tokens is not None else cfg.gemini_max_output_tokens),
        )
        self._daily_budget_usd: float = float(
            daily_budget_usd if daily_budget_usd is not None else cfg.llm_daily_budget_usd
        )
        self._call_log = call_log
        self._trace_sink = trace_sink
        self._ops = ops_metrics or get_ops_metrics()
        self._external_client = client
        self._client: httpx.AsyncClient | None = client
        self._client_loop: asyncio.AbstractEventLoop | None = None
        self._breaker = CircuitBreaker(
            threshold=breaker_threshold,
            cooldown_s=breaker_cooldown_s,
            clock=clock,
        )

    def _get_client(self) -> httpx.AsyncClient:
        if self._external_client is not None:
            return self._external_client
        loop = asyncio.get_running_loop()
        if self._client is None or self._client.is_closed or self._client_loop is not loop:
            timeout = httpx.Timeout(
                connect=DEFAULT_CONNECT_TIMEOUT_S, read=self._timeout_s, write=5.0, pool=5.0
            )
            self._client = httpx.AsyncClient(
                timeout=timeout,
                limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            )
            self._client_loop = loop
        return self._client

    def _build_body(
        self,
        system: str,
        messages: Sequence[ChatTurnInput],
        max_output_tokens: int,
    ) -> dict[str, Any]:
        capped_tokens = min(self._max_output_cap, max(32, int(max_output_tokens)))
        contents: list[dict[str, Any]] = []
        total_chars = 0
        for turn in messages:
            text = turn.content.strip()
            if not text:
                continue
            if total_chars + len(text) > MAX_HISTORY_CHARS:
                text = text[: max(200, MAX_HISTORY_CHARS - total_chars)]
            total_chars += len(text)
            role = "model" if turn.role == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": text}]})

        gen_config: dict[str, Any] = {
            "maxOutputTokens": capped_tokens,
            "temperature": 0.35,
            "topP": 0.9,
        }
        # Disable thinking tokens on Gemini 2.5 Flash for sub-second chatbot responsiveness.
        if "2.5-flash" in self.model:
            gen_config["thinkingConfig"] = {"thinkingBudget": 0}

        return {
            "systemInstruction": {"parts": [{"text": system[:MAX_SYSTEM_CHARS]}]},
            "contents": contents,
            "generationConfig": gen_config,
        }

    def _headers(self, key_override: str | None = None) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "x-goog-api-key": key_override or self._api_key,
        }

    def _check_budget(self, est_in_tokens: int, max_tokens: int, language: str, ward_id: str | None) -> None:
        if self._call_log is None:
            return
        _, spent_today = self._call_log.today("llm")
        est_call = estimate_cost_usd(self.model, est_in_tokens, max_tokens) or 0.0
        if spent_today + est_call > self._daily_budget_usd:
            self._emit_trace(
                status="budget_exceeded",
                latency_ms=0.0,
                tokens_in=0,
                tokens_out=0,
                cost_usd=0.0,
                fallback_used=True,
                error_type="BudgetExceededError",
                language=language,
                ward_id=ward_id,
            )
            raise ChatBudgetExceededError("Daily LLM budget exceeded")

    def _emit_trace(
        self,
        *,
        status: str,
        latency_ms: float,
        tokens_in: int,
        tokens_out: int,
        cost_usd: float,
        fallback_used: bool,
        error_type: str | None = None,
        language: str = "en",
        ward_id: str | None = None,
    ) -> None:
        if self._trace_sink is None:
            return
        self._trace_sink.emit(
            LLMCallRecord(
                request_id=request_id_var.get(),
                route="/api/v1/chat",
                feature="chat",
                prompt_name="abhas_chat",
                prompt_version="v1",
                provider=self.provider,
                model=self.model,
                attempt=1,
                fallback_used=fallback_used,
                status=status,
                latency_ms=round(latency_ms, 2),
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                cost_usd=cost_usd,
                error_type=error_type,
                numbers_validated=True,
                ward_id=ward_id,
                origin_week=None,
                horizon=None,
                language=language,
            )
        )

    async def complete(
        self,
        *,
        system: str,
        messages: Sequence[ChatTurnInput],
        max_output_tokens: int,
        language: str = "en",
        ward_id: str | None = None,
    ) -> ChatLLMResult:
        if not self._api_key:
            raise ChatLLMUnavailableError("GEMINI_API_KEY not configured")
        if is_offline():
            raise ChatLLMUnavailableError("Offline mode active; skipping Gemini API call")

        est_in = (len(system) + sum(len(m.content) for m in messages)) // 4
        self._check_budget(est_in, max_output_tokens, language, ward_id)

        if not self._breaker.allow_request():
            raise ChatLLMUnavailableError("Gemini circuit breaker is open")

        url = f"{GEMINI_API_BASE}/{self.model}:generateContent"
        body = self._build_body(system, messages, max_output_tokens)
        client = self._get_client()

        last_err: Exception | None = None
        keys_to_try = self._api_keys or ([self._api_key] if self._api_key else [])
        for key_idx, active_key in enumerate(keys_to_try):
            for attempt in range(2):
                t0 = time.perf_counter()
                try:
                    resp = await client.post(url, headers=self._headers(active_key), json=body)
                    latency_ms = (time.perf_counter() - t0) * 1000.0
                    if resp.status_code in _RETRYABLE_STATUS:
                        if key_idx + 1 < len(keys_to_try):
                            # Immediately fail over to backup Gemini key on 429/5xx.
                            break
                        if attempt == 0:
                            await asyncio.sleep(0.35)
                            continue
                    if resp.status_code != 200:
                        if key_idx + 1 < len(keys_to_try):
                            break
                        self._breaker.record_failure()
                        self._ops.record_llm_event(call=True, error=True)
                        self._emit_trace(
                            status="error",
                            latency_ms=latency_ms,
                            tokens_in=0,
                            tokens_out=0,
                            cost_usd=0.0,
                            fallback_used=True,
                            error_type=f"HTTP{resp.status_code}",
                            language=language,
                            ward_id=ward_id,
                        )
                        raise ChatLLMUnavailableError(f"Gemini returned HTTP {resp.status_code}")

                    data = resp.json()
                    text = _extract_gemini_text(data).strip()
                    if not text:
                        self._breaker.record_failure()
                        raise ChatLLMUnavailableError("Gemini returned empty text")

                    self._breaker.record_success()
                    in_tok, out_tok = _extract_gemini_usage(data)
                    cost = estimate_cost_usd(self.model, in_tok, out_tok) or 0.0
                    self._ops.record_llm_event(call=True, error=False)
                    if self._call_log is not None:
                        self._call_log.record(
                            "llm",
                            True,
                            latency_ms,
                            cost_usd=cost,
                            detail=f"chat:{self.model}",
                        )
                    self._emit_trace(
                        status="ok",
                        latency_ms=latency_ms,
                        tokens_in=in_tok,
                        tokens_out=out_tok,
                        cost_usd=cost,
                        fallback_used=False,
                        language=language,
                        ward_id=ward_id,
                    )
                    return ChatLLMResult(
                        text=text,
                        model=self.model,
                        input_tokens=in_tok,
                        output_tokens=out_tok,
                        cost_usd=cost,
                        latency_ms=round(latency_ms, 2),
                    )
                except (httpx.TimeoutException, httpx.HTTPError, ValueError) as exc:
                    last_err = exc
                    latency_ms = (time.perf_counter() - t0) * 1000.0
                    if attempt == 0:
                        await asyncio.sleep(0.25)
                        continue
                    if key_idx + 1 < len(keys_to_try):
                        break
                    self._breaker.record_failure()
                    self._ops.record_llm_event(call=True, error=True)
                    self._emit_trace(
                        status="timeout" if isinstance(exc, httpx.TimeoutException) else "error",
                        latency_ms=latency_ms,
                        tokens_in=0,
                        tokens_out=0,
                        cost_usd=0.0,
                        fallback_used=True,
                        error_type=type(exc).__name__,
                        language=language,
                        ward_id=ward_id,
                    )
                    raise ChatLLMUnavailableError(f"Gemini request failed: {type(exc).__name__}") from exc

        self._breaker.record_failure()
        raise ChatLLMUnavailableError(f"Gemini request failed: {type(last_err).__name__}")

    async def stream(
        self,
        *,
        system: str,
        messages: Sequence[ChatTurnInput],
        max_output_tokens: int,
        language: str = "en",
        ward_id: str | None = None,
    ) -> AsyncIterator[str]:
        if not self._api_key:
            raise ChatLLMUnavailableError("GEMINI_API_KEY not configured")
        if is_offline():
            raise ChatLLMUnavailableError("Offline mode active; skipping Gemini stream call")

        est_in = (len(system) + sum(len(m.content) for m in messages)) // 4
        self._check_budget(est_in, max_output_tokens, language, ward_id)

        if not self._breaker.allow_request():
            raise ChatLLMUnavailableError("Gemini circuit breaker is open")

        url = f"{GEMINI_API_BASE}/{self.model}:streamGenerateContent"
        body = self._build_body(system, messages, max_output_tokens)
        client = self._get_client()

        t0 = time.perf_counter()
        in_tok = 0
        out_tok = 0
        emitted_any = False
        keys_to_try = self._api_keys or ([self._api_key] if self._api_key else [])
        last_status: int | None = None
        try:
            for key_idx, active_key in enumerate(keys_to_try):
                async with client.stream(
                    "POST",
                    url,
                    params={"alt": "sse"},
                    headers=self._headers(active_key),
                    json=body,
                ) as resp:
                    if resp.status_code != 200:
                        last_status = resp.status_code
                        if key_idx + 1 < len(keys_to_try):
                            continue
                        self._breaker.record_failure()
                        self._ops.record_llm_event(call=True, error=True)
                        raise ChatLLMUnavailableError(f"Gemini stream HTTP {resp.status_code}")

                    async for line in resp.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        raw = line[5:].strip()
                        if not raw or raw == "[DONE]":
                            continue
                        try:
                            chunk_payload = json.loads(raw)
                        except json.JSONDecodeError:
                            continue
                        u_in, u_out = _extract_gemini_usage(chunk_payload)
                        if u_in:
                            in_tok = u_in
                        if u_out:
                            out_tok = u_out
                        piece = _extract_gemini_text(chunk_payload)
                        if piece:
                            emitted_any = True
                            yield piece
                    break

            latency_ms = (time.perf_counter() - t0) * 1000.0
            if not emitted_any:
                self._breaker.record_failure()
                raise ChatLLMUnavailableError(f"Gemini stream produced no text (status={last_status})")
            self._breaker.record_success()
            cost = estimate_cost_usd(self.model, in_tok, out_tok) or 0.0
            self._ops.record_llm_event(call=True, error=False)
            if self._call_log is not None:
                self._call_log.record(
                    "llm",
                    True,
                    latency_ms,
                    cost_usd=cost,
                    detail=f"chat_stream:{self.model}",
                )
            self._emit_trace(
                status="ok",
                latency_ms=latency_ms,
                tokens_in=in_tok,
                tokens_out=out_tok,
                cost_usd=cost,
                fallback_used=False,
                language=language,
                ward_id=ward_id,
            )
        except (httpx.TimeoutException, httpx.HTTPError) as exc:
            self._breaker.record_failure()
            latency_ms = (time.perf_counter() - t0) * 1000.0
            self._ops.record_llm_event(call=True, error=True)
            self._emit_trace(
                status="timeout" if isinstance(exc, httpx.TimeoutException) else "error",
                latency_ms=latency_ms,
                tokens_in=in_tok,
                tokens_out=out_tok,
                cost_usd=0.0,
                fallback_used=True,
                error_type=type(exc).__name__,
                language=language,
                ward_id=ward_id,
            )
            raise ChatLLMUnavailableError(f"Gemini stream failed: {type(exc).__name__}") from exc
