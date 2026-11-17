from app.schemas import AskResponse, TriageResult
from app.services.language import detect_language


def test_healthz(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
    assert r.headers["x-request-id"]


def test_ask_sync_schema(client):
    r = client.post("/ask", json={"question": "How much credit for 30 hours down?"})
    assert r.status_code == 200
    AskResponse.model_validate(r.json())


def test_triage_schema(client):
    r = client.post("/triage", json={"text": "my internet is down"})
    assert r.status_code == 200
    TriageResult.model_validate(r.json())


def test_validation_error_envelope(client):
    r = client.post("/triage", json={"text": ""})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"


def test_ask_stream_events(client):
    with client.stream("POST", "/ask/stream", json={"question": "hi"}) as r:
        body = "".join(r.iter_text())
    assert "event: meta" in body and "event: done" in body


def test_detect_language():
    assert detect_language("আমার ইন্টারনেট খুব ধীর") == "bn"
    assert detect_language("bhai amar net ekdom slow, ki korbo?") == "banglish"
    assert detect_language("My internet is down") == "en"
