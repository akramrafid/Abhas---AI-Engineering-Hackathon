"""Chat vertical slice tests: live ward grounding, Gemini adapter, SSE streaming, cache, and secret redaction."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Sequence

from fastapi.testclient import TestClient

from app.adapters.db.factory import get_observation_repository, get_prediction_cache
from app.adapters.openmeteo import get_weather_source
from app.adapters.runtime import get_forecast_model, get_ops_registry
from app.core.logging import redact_secrets
from app.features.chat.knowledge import detect_language, extract_mentioned_ward_id
from app.features.chat.schemas import ChatRequest
from app.features.chat.service import ChatService, clear_chat_cache
from app.main import create_app
from app.ports.chat_llm import ChatLLMResult, ChatLLMUnavailableError, ChatTurnInput
from app.shared.forecast_engine import ForecastEngine


class _FakeGeminiLLM:
    model = "gemini-2.5-flash"

    def __init__(self, reply: str = "Grounded Gemini answer for Abhas.", fail: bool = False) -> None:
        self.reply = reply
        self.fail = fail
        self.calls = 0
        self.last_system = ""

    async def complete(
        self,
        *,
        system: str,
        messages: Sequence[ChatTurnInput],
        max_output_tokens: int,
        language: str = "en",
        ward_id: str | None = None,
    ) -> ChatLLMResult:
        self.calls += 1
        self.last_system = system
        if self.fail:
            raise ChatLLMUnavailableError("simulated outage")
        return ChatLLMResult(
            text=self.reply,
            model=self.model,
            input_tokens=120,
            output_tokens=40,
            cost_usd=0.000042,
            latency_ms=42.0,
        )

    async def stream(
        self,
        *,
        system: str,
        messages: Sequence[ChatTurnInput],
        max_output_tokens: int,
        language: str = "en",
        ward_id: str | None = None,
    ) -> AsyncIterator[str]:
        self.calls += 1
        self.last_system = system
        if self.fail:
            raise ChatLLMUnavailableError("simulated stream outage")
        for chunk in self.reply.split(" "):
            yield chunk + " "


def test_chat_endpoint_grounded_fallback_and_ward_extraction() -> None:
    clear_chat_cache()
    with TestClient(create_app()) as c:
        r = c.post(
            "/api/v1/chat",
            json={"message": "What is the forecast for Ward 4 Dhaka South?"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["grounded_ward"] == "DSCC_Ward_04"
        assert body["language"] == "en"
        assert "DSCC_Ward_04" in body["reply"]
        assert body["source"] == "grounded_fallback"
        assert len(body["suggestions"]) >= 2

        # Second identical request hits fast response cache
        r2 = c.post(
            "/api/v1/chat",
            json={"message": "What is the forecast for Ward 4 Dhaka South?"},
        )
        assert r2.status_code == 200
        assert r2.json()["cached"] is True


def test_chat_endpoint_bangla_detection_and_validation() -> None:
    clear_chat_cache()
    assert detect_language("বৃষ্টির ৩ সপ্তাহ পর কেন ডেঙ্গু বাড়ে?", "auto") == "bn"
    assert detect_language("Why 3 weeks?", "auto") == "en"
    assert extract_mentioned_ward_id("Check CCC_Ward_03 please", {"CCC_Ward_03"}) == "CCC_Ward_03"
    assert extract_mentioned_ward_id("What about Chattogram Ward 3?", {"CCC_Ward_03"}) == "CCC_Ward_03"

    with TestClient(create_app()) as c:
        r_bn = c.post("/api/v1/chat", json={"message": "বৃষ্টির ৩ সপ্তাহ পর কেন ডেঙ্গু বাড়ে?"})
        assert r_bn.status_code == 200
        assert r_bn.json()["language"] == "bn"
        assert "0.47" in r_bn.json()["reply"]

        r_empty = c.post("/api/v1/chat", json={"message": "   "})
        assert r_empty.status_code == 422


def test_chat_stream_sse_endpoint() -> None:
    clear_chat_cache()
    with TestClient(create_app()) as c:
        with c.stream("POST", "/api/v1/chat/stream", json={"message": "How accurate is Abhas?"}) as resp:
            assert resp.status_code == 200
            assert resp.headers["content-type"].startswith("text/event-stream")
            text = "".join(resp.iter_text())
            assert "event: meta" in text
            assert "event: delta" in text
            assert "event: done" in text
            assert "LightGBM" in text


def test_chat_service_uses_gemini_adapter_and_falls_back_on_error() -> None:
    clear_chat_cache()
    repo = get_observation_repository()
    engine = ForecastEngine(
        repo=repo,
        model=get_forecast_model(),
        cache=get_prediction_cache(),
        weather_source=get_weather_source(),
        ops_metrics=get_ops_registry(),
    )

    fake_ok = _FakeGeminiLLM("DSCC_Ward_04 is Critical at +3 weeks.")
    svc = ChatService(repo=repo, engine=engine, llm=fake_ok)
    res = asyncio.run(svc.reply(ChatRequest(message="Tell me about DSCC_Ward_04")))
    assert res.source == "gemini"
    assert res.model == "gemini-2.5-flash"
    assert res.grounded_ward == "DSCC_Ward_04"
    assert "<live_context>" in fake_ok.last_system
    assert fake_ok.calls == 1

    # Fallback when Gemini fails
    clear_chat_cache()
    fake_fail = _FakeGeminiLLM(fail=True)
    svc_fail = ChatService(repo=repo, engine=engine, llm=fake_fail)
    res_fail = asyncio.run(svc_fail.reply(ChatRequest(message="Tell me about DSCC_Ward_04")))
    assert res_fail.source == "grounded_fallback"
    assert "DSCC_Ward_04" in res_fail.reply


def test_secret_redaction_masks_gemini_aq_keys_and_header() -> None:
    sample = "x-goog-api-key=AQ.FakeExampleKey1234567890abcdef_XYZ"
    masked = redact_secrets(sample)
    assert "AQ.FakeExampleKey" not in masked
    assert "[REDACTED]" in masked


def test_gemini_adapter_dual_key_failover_on_429() -> None:
    """When primary key returns 429, GeminiChatAdapter immediately fails over to fallback key."""
    import httpx

    from app.adapters.gemini_chat import GeminiChatAdapter
    from app.core.config import Settings

    seen_keys: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        key = request.headers.get("x-goog-api-key", "")
        seen_keys.append(key)
        if key == "AQ.PrimaryKey123456789012345":
            return httpx.Response(429, json={"error": {"code": 429, "message": "rate limited"}})
        return httpx.Response(
            200,
            json={
                "candidates": [{"content": {"parts": [{"text": "Fallback key reply works."}]}}],
                "usageMetadata": {"promptTokenCount": 50, "candidatesTokenCount": 12},
            },
        )

    async def _run() -> str:
        cfg = Settings(
            gemini_api_key="AQ.PrimaryKey123456789012345",  # type: ignore[arg-type]
            gemini_api_key_fallback="AQ.BackupKey1234567890123456",  # type: ignore[arg-type]
        )
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=5.0) as client:
            adapter = GeminiChatAdapter(settings=cfg, client=client)
            res = await adapter.complete(
                system="Test system",
                messages=[ChatTurnInput(role="user", content="Hi")],
                max_output_tokens=64,
            )
            return res.text

    reply = asyncio.run(_run())
    assert reply == "Fallback key reply works."
    assert seen_keys == ["AQ.PrimaryKey123456789012345", "AQ.BackupKey1234567890123456"]
