"""Framework-free business logic for the chat vertical slice (ADR-0001).

- Grounds every response in verified Abhas project facts AND live ward forecasts from ForecastEngine.
- Calls Gemini Flash via app.ports.chat_llm.ChatLLM when configured, with automatic deterministic fallback.
- Includes a small in-memory TTL cache for single-turn FAQ prompts (< 5 ms repeat latency).
"""

from __future__ import annotations

import hashlib
import logging
import time
from collections import OrderedDict
from collections.abc import AsyncIterator
from datetime import date
from typing import Any, Literal

from app.ports.chat_llm import (
    ChatBudgetExceededError,
    ChatLLM,
    ChatLLMUnavailableError,
    ChatTurnInput,
)
from app.ports.repositories import ObservationRepository
from app.shared.forecast_engine import ForecastEngine

from .knowledge import (
    build_grounded_fallback,
    build_system_prompt,
    default_suggestions,
    detect_language,
    extract_mentioned_ward_id,
)
from .schemas import ChatRequest, ChatResponse

logger = logging.getLogger("abhas.chat")

DEFAULT_DEMO_ORIGIN = date(2024, 8, 5)
_CACHE_TTL_S = 300.0
_CACHE_MAX_ITEMS = 128

_TIER_RANK = {"Low": 0, "Medium": 1, "High": 2, "Critical": 3}

# Process-local fast response cache for single-turn FAQ questions.
_RESPONSE_CACHE: OrderedDict[str, tuple[float, ChatResponse]] = OrderedDict()


def clear_chat_cache() -> None:
    _RESPONSE_CACHE.clear()


def _cache_key(
    message: str,
    language: str,
    ward_id: str | None,
    origin_week: date | None,
    model_name: str,
) -> str:
    norm = " ".join(message.lower().split())
    raw = f"{norm}|{language}|{ward_id or ''}|{origin_week.isoformat() if origin_week else ''}|{model_name}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class ChatService:
    """Abhas conversational assistant service with live ward-forecast grounding and Gemini Flash."""

    def __init__(
        self,
        *,
        repo: ObservationRepository,
        engine: ForecastEngine,
        llm: ChatLLM | None = None,
        max_output_tokens: int = 512,
    ) -> None:
        self._repo = repo
        self._engine = engine
        self._llm = llm
        self._max_output_tokens = max(64, min(768, int(max_output_tokens)))

    def _resolve_live_context(self, req: ChatRequest) -> tuple[str | None, dict[str, Any] | None]:
        """Fetch live forecast & metadata if the user mentioned a ward or passed active dashboard ward."""
        wards = self._repo.wards()
        valid_ids = {w.ward_id for w in wards}
        mentioned = extract_mentioned_ward_id(req.message, valid_ids)
        target_ward = mentioned or (req.ward_id if req.ward_id in valid_ids else None)

        if target_ward is None:
            return None, None

        origin = req.origin_week or DEFAULT_DEMO_ORIGIN
        try:
            batch = self._engine.forecast(
                ward_ids=[target_ward],
                origin_week=origin,
                horizons=[1, 2, 3, 4],
                source="dataset",
            )
            wf = batch.forecasts[0]
            peak = max(
                wf.horizons,
                key=lambda h: (_TIER_RANK.get(h.tier, 0), h.expected_cases),
            )
            ward_rec = self._repo.ward(target_ward)
            context: dict[str, Any] = {
                "ward_forecast": {
                    "ward_id": wf.ward_id,
                    "city": wf.city,
                    "origin_week": origin.isoformat(),
                    "model_version": batch.model_version,
                    "water_logging_risk_index": round(ward_rec.water_logging_risk_index, 2)
                    if ward_rec
                    else None,
                    "sanitation_score": round(ward_rec.sanitation_score, 2) if ward_rec else None,
                    "population_density_sqkm": round(ward_rec.population_density_sqkm, 1)
                    if ward_rec
                    else None,
                    "peak_horizon": {
                        "horizon": peak.horizon,
                        "target_week": peak.target_week.isoformat(),
                        "tier": peak.tier,
                        "expected_cases": round(peak.expected_cases, 1),
                        "p10": round(peak.p10, 1),
                        "p90": round(peak.p90, 1),
                        "risk_score": peak.risk_score,
                        "drivers": [
                            {
                                "label": d.label,
                                "effect_pct": round(d.effect_pct, 1),
                                "direction": d.direction,
                            }
                            for d in peak.drivers[:4]
                        ],
                    },
                    "all_horizons": [
                        {
                            "horizon": h.horizon,
                            "target_week": h.target_week.isoformat(),
                            "tier": h.tier,
                            "expected_cases": round(h.expected_cases, 1),
                            "p10": round(h.p10, 1),
                            "p90": round(h.p90, 1),
                        }
                        for h in wf.horizons
                    ],
                }
            }
            return target_ward, context
        except Exception as exc:  # noqa: BLE001
            logger.warning("chat_live_context_failed: %s", type(exc).__name__)
            return target_ward, None

    def _build_turns(self, req: ChatRequest) -> list[ChatTurnInput]:
        turns = [ChatTurnInput(role=t.role, content=t.content) for t in req.history[-10:]]
        turns.append(ChatTurnInput(role="user", content=req.message))
        return turns

    async def reply(self, req: ChatRequest) -> ChatResponse:
        t0 = time.perf_counter()
        lang: Literal["en", "bn"] = detect_language(req.message, req.language)
        grounded_ward, live_context = self._resolve_live_context(req)
        model_tag = self._llm.model if self._llm is not None else "fallback"

        # Fast cache lookup for single-turn questions.
        cache_k: str | None = None
        if not req.history:
            cache_k = _cache_key(req.message, lang, grounded_ward, req.origin_week, model_tag)
            entry = _RESPONSE_CACHE.get(cache_k)
            if entry is not None:
                ts, cached_resp = entry
                if time.monotonic() - ts <= _CACHE_TTL_S:
                    _RESPONSE_CACHE.move_to_end(cache_k)
                    elapsed = round((time.perf_counter() - t0) * 1000.0, 1)
                    return cached_resp.model_copy(update={"cached": True, "latency_ms": elapsed})
                _RESPONSE_CACHE.pop(cache_k, None)

        system_prompt = build_system_prompt(lang, live_context)
        turns = self._build_turns(req)

        reply_text: str | None = None
        source: Literal["gemini", "grounded_fallback"] = "grounded_fallback"
        model_used: str | None = None

        if self._llm is not None:
            try:
                llm_res = await self._llm.complete(
                    system=system_prompt,
                    messages=turns,
                    max_output_tokens=self._max_output_tokens,
                    language=lang,
                    ward_id=grounded_ward,
                )
                reply_text = llm_res.text
                source = "gemini"
                model_used = llm_res.model
            except (ChatBudgetExceededError, ChatLLMUnavailableError) as exc:
                logger.info("chat_llm_fallback: %s", type(exc).__name__)

        if not reply_text:
            reply_text = build_grounded_fallback(req.message, lang, live_context)
            source = "grounded_fallback"
            model_used = None

        elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 1)
        response = ChatResponse(
            reply=reply_text[:4000],
            language=lang,
            source=source,
            model=model_used,
            cached=False,
            latency_ms=elapsed_ms,
            grounded_ward=grounded_ward,
            suggestions=default_suggestions(lang, grounded_ward),
        )

        if cache_k is not None and (self._llm is None or source == "gemini"):
            _RESPONSE_CACHE[cache_k] = (time.monotonic(), response)
            if len(_RESPONSE_CACHE) > _CACHE_MAX_ITEMS:
                _RESPONSE_CACHE.popitem(last=False)

        return response

    async def stream_reply(self, req: ChatRequest) -> AsyncIterator[dict[str, Any]]:
        """Yield structured events (`meta`, `delta`, `done`) for real-time SSE streaming."""
        t0 = time.perf_counter()
        lang: Literal["en", "bn"] = detect_language(req.message, req.language)
        grounded_ward, live_context = self._resolve_live_context(req)
        suggestions = default_suggestions(lang, grounded_ward)
        model_tag = self._llm.model if self._llm is not None else "fallback"

        # Serve cached single-turn answers instantaneously.
        cache_k: str | None = None
        if not req.history:
            cache_k = _cache_key(req.message, lang, grounded_ward, req.origin_week, model_tag)
            entry = _RESPONSE_CACHE.get(cache_k)
            if entry is not None:
                ts, cached_resp = entry
                if time.monotonic() - ts <= _CACHE_TTL_S:
                    _RESPONSE_CACHE.move_to_end(cache_k)
                    yield {
                        "event": "meta",
                        "data": {
                            "language": cached_resp.language,
                            "source": cached_resp.source,
                            "model": cached_resp.model,
                            "grounded_ward": cached_resp.grounded_ward,
                            "cached": True,
                        },
                    }
                    yield {"event": "delta", "data": {"text": cached_resp.reply}}
                    yield {
                        "event": "done",
                        "data": {
                            "latency_ms": round((time.perf_counter() - t0) * 1000.0, 1),
                            "suggestions": cached_resp.suggestions,
                            "source": cached_resp.source,
                            "model": cached_resp.model,
                            "cached": True,
                        },
                    }
                    return
                _RESPONSE_CACHE.pop(cache_k, None)

        system_prompt = build_system_prompt(lang, live_context)
        turns = self._build_turns(req)

        if self._llm is not None:
            collected: list[str] = []
            try:
                yield {
                    "event": "meta",
                    "data": {
                        "language": lang,
                        "source": "gemini",
                        "model": self._llm.model,
                        "grounded_ward": grounded_ward,
                        "cached": False,
                    },
                }
                async for piece in self._llm.stream(
                    system=system_prompt,
                    messages=turns,
                    max_output_tokens=self._max_output_tokens,
                    language=lang,
                    ward_id=grounded_ward,
                ):
                    collected.append(piece)
                    yield {"event": "delta", "data": {"text": piece}}

                full_text = "".join(collected).strip()
                elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 1)
                if full_text and cache_k is not None:
                    cached_obj = ChatResponse(
                        reply=full_text[:4000],
                        language=lang,
                        source="gemini",
                        model=self._llm.model,
                        cached=False,
                        latency_ms=elapsed_ms,
                        grounded_ward=grounded_ward,
                        suggestions=suggestions,
                    )
                    _RESPONSE_CACHE[cache_k] = (time.monotonic(), cached_obj)
                    if len(_RESPONSE_CACHE) > _CACHE_MAX_ITEMS:
                        _RESPONSE_CACHE.popitem(last=False)

                yield {
                    "event": "done",
                    "data": {
                        "latency_ms": elapsed_ms,
                        "suggestions": suggestions,
                        "source": "gemini",
                        "model": self._llm.model,
                        "cached": False,
                    },
                }
                return
            except (ChatBudgetExceededError, ChatLLMUnavailableError) as exc:
                logger.info("chat_stream_fallback: %s", type(exc).__name__)
                if collected:
                    yield {
                        "event": "done",
                        "data": {
                            "latency_ms": round((time.perf_counter() - t0) * 1000.0, 1),
                            "suggestions": suggestions,
                            "source": "gemini",
                            "model": self._llm.model,
                            "cached": False,
                        },
                    }
                    return

        fallback_text = build_grounded_fallback(req.message, lang, live_context)
        yield {
            "event": "meta",
            "data": {
                "language": lang,
                "source": "grounded_fallback",
                "model": None,
                "grounded_ward": grounded_ward,
                "cached": False,
            },
        }
        yield {"event": "delta", "data": {"text": fallback_text}}
        yield {
            "event": "done",
            "data": {
                "latency_ms": round((time.perf_counter() - t0) * 1000.0, 1),
                "suggestions": suggestions,
                "source": "grounded_fallback",
                "model": None,
                "cached": False,
            },
        }
