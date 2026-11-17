"""Thin OpenAI-compatible LLM adapter: retries, timeouts, fallback model, usage/cost accounting, mock mode.

Services call `get_llm()`; never import `openai` elsewhere.
"""

import json
import logging
import time
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass, field
from typing import TypeVar

import httpx
from openai import APIConnectionError, APIStatusError, APITimeoutError, AsyncOpenAI, RateLimitError
from pydantic import BaseModel, ValidationError
from tenacity import AsyncRetrying, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.core.config import Settings, get_settings
from app.core.errors import UpstreamError
from app.core.logging import log_event
from app.schemas.common import Usage

log = logging.getLogger("app.llm")
T = TypeVar("T", bound=BaseModel)
_TRANSIENT = (APIConnectionError, APITimeoutError)
_STREAM_ERRORS = (APIConnectionError, APITimeoutError, APIStatusError, httpx.HTTPError)
_COOLDOWN_RATE_LIMIT_S = 60.0
_COOLDOWN_BAD_REQUEST_S = 600.0
_CONTENT_STATUSES = {400, 413, 422}
_BAD_REQUEST_TRIP = 3  # consecutive 400s before a model is treated as misconfigured


@dataclass
class UsageMeter:
    """Accumulates usage across the LLM calls of one request."""

    model: str
    calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    started: float = field(default_factory=time.perf_counter)
    price_in: float = 0.0
    price_out: float = 0.0

    def add(self, prompt: int, completion: int) -> None:
        self.calls += 1
        self.prompt_tokens += prompt
        self.completion_tokens += completion

    def to_usage(self, cached: bool = False) -> Usage:
        cost = (self.prompt_tokens * self.price_in + self.completion_tokens * self.price_out) / 1_000_000
        return Usage(
            model=self.model,
            llm_calls=self.calls,
            prompt_tokens=self.prompt_tokens,
            completion_tokens=self.completion_tokens,
            cost_usd=round(cost, 6),
            latency_ms=round((time.perf_counter() - self.started) * 1000, 1),
            cached=cached,
        )


MockFn = Callable[[list[dict]], str]


class LLMClient:
    def __init__(self, settings: Settings, mock_fn: MockFn | None = None) -> None:
        self.s = settings
        self.mock = not settings.llm_enabled
        self.mock_fn = mock_fn
        self._cooldown_until: dict[str, float] = {}
        self._bad_request_streak: dict[str, int] = {}
        self._client = (
            None
            if self.mock
            else AsyncOpenAI(
                base_url=settings.llm_base_url,
                api_key=settings.llm_api_key.get_secret_value(),
                timeout=settings.llm_timeout_s,
                max_retries=0,
            )
        )

    def meter(self) -> UsageMeter:
        return UsageMeter(
            model="mock" if self.mock else self.s.llm_model,
            price_in=self.s.llm_price_in_per_mtok,
            price_out=self.s.llm_price_out_per_mtok,
        )

    def _candidates(self) -> list[str]:
        """Configured models in order, skipping ones in cooldown (unless all are cooling down)."""
        models = [self.s.llm_model] + ([self.s.llm_fallback_model] if self.s.llm_fallback_model else [])
        now = time.monotonic()
        ready = [m for m in models if self._cooldown_until.get(m, 0.0) <= now]
        return ready or models

    def _cool_down(self, model: str, exc: Exception) -> None:
        """Trip the breaker only for model-health signals. A 400/413/422 can be caused by request content,
        so it fails over for this request only, and trips the breaker after several in a row."""
        status = getattr(exc, "status_code", None)
        if status in _CONTENT_STATUSES:
            self._bad_request_streak[model] = self._bad_request_streak.get(model, 0) + 1
            if self._bad_request_streak[model] < _BAD_REQUEST_TRIP:
                log.warning("llm_request_rejected", extra={"data": {"model": model, "status": status}})
                return
        self._bad_request_streak[model] = 0
        seconds = _COOLDOWN_RATE_LIMIT_S if isinstance(exc, RateLimitError) else _COOLDOWN_BAD_REQUEST_S
        self._cooldown_until[model] = time.monotonic() + seconds
        log.warning(
            "llm_model_cooldown",
            extra={
                "data": {
                    "model": model,
                    "status": getattr(exc, "status_code", None),
                    "error": type(exc).__name__,
                    "cooldown_s": seconds,
                }
            },
        )

    async def _create(self, meter: "UsageMeter", **kwargs):  # noqa: ANN202
        """Call the first healthy model. Transient network errors are retried on the same model;
        429 / 4xx move straight to the next model and put the failing one in cooldown."""
        if self._client is None:
            raise UpstreamError()
        if self.s.llm_reasoning_effort:
            kwargs["reasoning_effort"] = self.s.llm_reasoning_effort
        last: Exception | None = None
        for model in self._candidates():
            try:
                async for attempt in AsyncRetrying(
                    stop=stop_after_attempt(self.s.llm_max_retries + 1),
                    wait=wait_exponential(multiplier=0.5, max=4),
                    retry=retry_if_exception_type(_TRANSIENT),
                    reraise=True,
                ):
                    with attempt:
                        resp = await self._client.chat.completions.create(model=model, **kwargs)
                meter.model = model  # report the model that actually served the request
                self._bad_request_streak[model] = 0
                return resp
            except (RateLimitError, APIStatusError) as exc:
                last = exc
                self._cool_down(model, exc)
            except _TRANSIENT as exc:
                last = exc
                log.warning("llm_error", extra={"data": {"model": model, "error": type(exc).__name__}})
        raise UpstreamError() from last

    async def complete_json(
        self,
        messages: list[dict],
        schema: type[T],
        meter: UsageMeter,
        temperature: float = 0.0,
        max_tokens: int = 900,
    ) -> T:
        """Return a validated `schema` instance. Retries once with the validation error on bad JSON."""
        if self.mock:
            meter.add(0, 0)
            raw = self.mock_fn(messages) if self.mock_fn else "{}"
            return schema.model_validate_json(raw)
        msgs = list(messages)
        for attempt in range(2):
            t0 = time.perf_counter()
            resp = await self._create(
                meter,
                messages=msgs,
                temperature=temperature,
                max_tokens=max_tokens,
                response_format={"type": "json_object"},
            )
            u = resp.usage
            meter.add(u.prompt_tokens if u else 0, u.completion_tokens if u else 0)
            content = resp.choices[0].message.content or ""
            log_event(
                log,
                "llm_call",
                kind="json",
                model=meter.model,
                latency_ms=round((time.perf_counter() - t0) * 1000, 1),
                prompt_tokens=u.prompt_tokens if u else 0,
                completion_tokens=u.completion_tokens if u else 0,
            )
            try:
                return schema.model_validate(json.loads(content))
            except (json.JSONDecodeError, ValidationError) as exc:
                if attempt == 1:
                    raise UpstreamError("The AI returned an invalid response. Please retry.") from exc
                msgs = msgs + [
                    {"role": "assistant", "content": content[:2000]},
                    {
                        "role": "user",
                        "content": f"Invalid JSON for the schema: {str(exc)[:500]}. "
                        "Return only corrected JSON.",
                    },
                ]
        raise UpstreamError()  # pragma: no cover

    async def stream_text(
        self, messages: list[dict], meter: UsageMeter, temperature: float = 0.1, max_tokens: int = 700
    ) -> AsyncIterator[str]:
        """Yield text deltas. Usage is recorded on the meter when the stream ends."""
        if self.mock:
            meter.add(0, 0)
            text = self.mock_fn(messages) if self.mock_fn else "Mock answer."
            for word in text.split(" "):
                yield word + " "
            return
        t0 = time.perf_counter()
        stream = await self._create(
            meter,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
            stream_options={"include_usage": True},
        )
        prompt = completion = 0
        try:
            async for chunk in stream:
                if chunk.usage:
                    prompt, completion = chunk.usage.prompt_tokens, chunk.usage.completion_tokens
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except _STREAM_ERRORS as exc:
            raise UpstreamError() from exc
        finally:
            meter.add(prompt, completion)
            log_event(
                log,
                "llm_call",
                kind="stream",
                model=meter.model,
                latency_ms=round((time.perf_counter() - t0) * 1000, 1),
                prompt_tokens=prompt,
                completion_tokens=completion,
            )


_llm: LLMClient | None = None


def get_llm() -> LLMClient:
    global _llm
    if _llm is None:
        _llm = LLMClient(get_settings())
    return _llm


def set_llm(client: LLMClient | None) -> None:
    """Test hook."""
    global _llm
    _llm = client
