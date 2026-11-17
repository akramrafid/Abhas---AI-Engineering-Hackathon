import json
import logging

from app.core.logging import JsonFormatter


def _fmt(text: str, **data: object) -> str:
    rec = logging.LogRecord("t", logging.INFO, __file__, 1, text, None, None)
    rec.data = data
    return JsonFormatter().format(rec)


def test_redacts_google_and_openai_keys_in_msg_and_extra():
    out = _fmt(
        "key=AIzaSyD1234567890abcdefghijklmnopqrstuvw",
        leak="sk-proj-1234567890abcdefghijklmnop",
        other="AQ.Ab8RN6Kfb0t53gs2XmI2XaZOfw72xx",
    )
    assert "AIzaSy" not in out and "sk-proj" not in out and "AQ.Ab8" not in out
    assert out.count("***") == 3


def test_extra_fields_cannot_overwrite_reserved_keys():
    out = json.loads(_fmt("real message", msg="spoofed", level="DEBUG"))
    assert out["msg"] == "real message" and out["level"] == "INFO"


def test_batch_rejects_concurrent_run(client, monkeypatch):
    from app.api.routes import triage as route

    async def _locked():
        await route._batch_lock.acquire()

    import asyncio

    asyncio.run(_locked())
    try:
        r = client.post("/triage/batch")
        assert r.status_code == 429
        assert r.json()["error"]["code"] == "batch_in_progress"
    finally:
        route._batch_lock.release()
