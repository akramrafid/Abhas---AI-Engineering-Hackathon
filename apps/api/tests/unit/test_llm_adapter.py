"""Real-path tests for the LLM adapter with a fake provider client (no network)."""

from types import SimpleNamespace

import httpx
import pytest
from openai import APIConnectionError, BadRequestError, RateLimitError
from pydantic import BaseModel, SecretStr

from app.adapters.llm import LLMClient
from app.core.config import Settings
from app.core.errors import UpstreamError


class _Out(BaseModel):
    ok: bool


def _resp(content: str):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
        usage=SimpleNamespace(prompt_tokens=10, completion_tokens=2),
    )


def _status_error(cls, code: int):
    req = httpx.Request("POST", "http://x")
    return cls("boom", response=httpx.Response(code, request=req), body=None)


class FakeCompletions:
    def __init__(self, script):
        self.script = script  # model -> list of results/exceptions (consumed in order)
        self.calls: list[str] = []

    async def create(self, model: str, **kwargs):
        self.calls.append(model)
        outcome = self.script[model].pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def _client(script, fallback="fb") -> tuple[LLMClient, FakeCompletions]:
    s = Settings(
        llm_api_key=SecretStr("test"),
        llm_model="primary",
        llm_fallback_model=fallback,
        llm_mock=False,
        llm_max_retries=1,
        llm_reasoning_effort="",
    )
    c = LLMClient(s)
    fake = FakeCompletions(script)
    c._client = SimpleNamespace(chat=SimpleNamespace(completions=fake))
    return c, fake


async def test_served_model_is_reported_after_fallback():
    c, fake = _client({"primary": [_status_error(BadRequestError, 400)], "fb": [_resp('{"ok": true}')]})
    meter = c.meter()
    out = await c.complete_json([{"role": "user", "content": "x"}], _Out, meter)
    assert out.ok and meter.model == "fb"
    assert fake.calls == ["primary", "fb"]


async def test_rate_limit_is_not_retried_and_model_cools_down():
    c, fake = _client(
        {
            "primary": [_status_error(RateLimitError, 429)],
            "fb": [_resp('{"ok": true}'), _resp('{"ok": true}')],
        }
    )
    await c.complete_json([{"role": "user", "content": "x"}], _Out, c.meter())
    await c.complete_json([{"role": "user", "content": "x"}], _Out, c.meter())
    assert fake.calls == ["primary", "fb", "fb"]  # primary skipped on the 2nd request


async def test_transient_error_is_retried_on_same_model():
    req = httpx.Request("POST", "http://x")
    c, fake = _client({"primary": [APIConnectionError(request=req), _resp('{"ok": true}')], "fb": []})
    meter = c.meter()
    await c.complete_json([{"role": "user", "content": "x"}], _Out, meter)
    assert fake.calls == ["primary", "primary"] and meter.model == "primary"


async def test_all_models_failing_raises_upstream_error():
    c, _ = _client(
        {"primary": [_status_error(RateLimitError, 429)], "fb": [_status_error(RateLimitError, 429)]}
    )
    with pytest.raises(UpstreamError):
        await c.complete_json([{"role": "user", "content": "x"}], _Out, c.meter())


async def test_invalid_json_is_repaired_once():
    c, fake = _client({"primary": [_resp("not json"), _resp('{"ok": false}')], "fb": []})
    out = await c.complete_json([{"role": "user", "content": "x"}], _Out, c.meter())
    assert out.ok is False and len(fake.calls) == 2


def test_unhandled_error_keeps_request_id(client, monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import create_app
    from app.services import triage

    async def boom(_req):
        raise RuntimeError("kaboom")

    monkeypatch.setattr(triage, "triage", boom)
    r = TestClient(create_app(), raise_server_exceptions=False).post(
        "/triage", json={"text": "hi"}, headers={"x-request-id": "abc123"}
    )
    assert r.status_code == 500
    assert r.json()["error"]["request_id"] == "abc123"
    assert "kaboom" not in r.text
