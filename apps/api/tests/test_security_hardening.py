"""Security hardening tests covering SEC-1 through SEC-12 and setup/redteam controls."""

from __future__ import annotations

import asyncio
import json
import logging
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.adapters.runtime import reset_runtime
from app.core.config import Settings, active_faults, get_settings
from app.core.logging import JsonFormatter, redact_secrets, request_id_var, sanitize_request_id
from app.core.ratelimit import MAX_TRACKED_KEYS, RateLimitMiddleware
from app.core.security import sanitize_csv_cell
from app.features.ops.router import _is_loopback_peer
from app.main import create_app

REPO_ROOT = Path(__file__).resolve().parents[3]
SETUP_SCRIPT = REPO_ROOT / "scripts" / "setup.mjs"
ROOT_PKG = REPO_ROOT / "package.json"


async def _asgi_call(
    app: Any,
    method: str,
    path: str,
    *,
    headers: list[tuple[bytes, bytes]] | None = None,
    chunks: list[bytes] | None = None,
    client: tuple[str, int] = ("127.0.0.1", 50000),
) -> tuple[int, dict[str, str], bytes, int]:
    req_chunks = list(chunks) if chunks is not None else [b""]
    idx = 0
    chunks_read = 0

    async def receive() -> dict[str, Any]:
        nonlocal idx, chunks_read
        if idx < len(req_chunks):
            c = req_chunks[idx]
            idx += 1
            chunks_read += 1
            return {"type": "http.request", "body": c, "more_body": idx < len(req_chunks)}
        return {"type": "http.disconnect"}

    status = 0
    resp_headers: dict[str, str] = {}
    body: list[bytes] = []

    async def send(msg: dict[str, Any]) -> None:
        nonlocal status
        if msg["type"] == "http.response.start":
            status = int(msg["status"])
            for k, v in msg.get("headers", []):
                resp_headers[k.decode("latin-1").lower()] = v.decode("latin-1")
        elif msg["type"] == "http.response.body":
            body.append(msg.get("body", b""))

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("ascii"),
        "query_string": b"",
        "headers": headers or [],
        "client": client,
        "server": ("127.0.0.1", 8000),
    }
    await app(scope, receive, send)
    return status, resp_headers, b"".join(body), chunks_read


def test_sec_1_and_sec_9_setup_zero_shell_and_ignore_scripts() -> None:
    """SEC-1 & SEC-9: setup.mjs never uses shell:true, runs npm via npm_execpath with --ignore-scripts."""
    src = SETUP_SCRIPT.read_text(encoding="utf-8")
    assert "shell: true" not in src
    assert "--ignore-scripts" in src

    pkg = json.loads(ROOT_PKG.read_text(encoding="utf-8"))
    assert "npm ci --no-audit --no-fund --ignore-scripts" in pkg["scripts"]["setup"]

    setup_url = SETUP_SCRIPT.as_uri()
    js = (
        f"import net from 'node:net'; "
        f"import {{ useShell, resolveNpmInvocation, checkMacLibomp, formatLightgbmRuntimeHint, formatPortInUseHint, checkPortAvailable }} from {json.dumps(setup_url)}; "
        "const viaNpm = resolveNpmInvocation({ npm_execpath: 'C:\\\\Program Files\\\\node\\\\npm-cli.js' }, true, 'C:\\\\Program Files\\\\node\\\\node.exe'); "
        "const winFallback = resolveNpmInvocation({ ComSpec: 'C:\\\\Windows\\\\System32\\\\cmd.exe' }, true, 'node'); "
        "const posixFallback = resolveNpmInvocation({}, false, 'node'); "
        "const brewCalls = []; "
        "const macAuto = checkMacLibomp({ platform: 'darwin', env: {}, exists: () => false, hasCmd: (c) => c === 'brew', runCmd: (c, a) => { brewCalls.push([c, a]); } }); "
        "const macSkip = checkMacLibomp({ platform: 'darwin', env: { ABHAS_SKIP_BREW: '1' }, exists: () => false, hasCmd: () => true, runCmd: () => { throw new Error('should not run'); } }); "
        "const winLgbHint = formatLightgbmRuntimeHint('WinError 126', 'win32'); "
        "const macLgbHint = formatLightgbmRuntimeHint('libomp.dylib', 'darwin'); "
        "const apiPortHint = formatPortInUseHint('API', 'API_PORT', 8000); "
        "const webPortHint = formatPortInUseHint('Web', 'WEB_PORT', 3000); "
        "const busySrv = net.createServer(); "
        "await new Promise((res) => busySrv.listen(0, '127.0.0.1', res)); "
        "const busyPort = busySrv.address().port; "
        "const busyCheck = await checkPortAvailable(busyPort); "
        "await new Promise((res) => busySrv.close(res)); "
        "console.log(JSON.stringify({ "
        "  shNpm: useShell('npm', true), "
        "  shMeta: useShell('C:\\\\Users\\\\Alice & Bob\\\\abhas\\\\python.exe', true), "
        "  viaNpm, winFallback, posixFallback, macAuto, macSkip, brewCalls, "
        "  winLgbHint, macLgbHint, apiPortHint, webPortHint, busyCheck "
        "}));"
    )
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", js], capture_output=True, text=True, check=False
    )
    assert proc.returncode == 0, proc.stderr
    data = json.loads(proc.stdout.strip())
    assert data["shNpm"] is False
    assert data["shMeta"] is False
    assert data["viaNpm"]["cmd"].endswith("node.exe")
    assert "--ignore-scripts" in data["viaNpm"]["args"]
    assert data["winFallback"]["args"][:4] == ["/d", "/s", "/c", "npm.cmd"]
    assert "--ignore-scripts" in data["winFallback"]["args"]
    assert data["posixFallback"]["cmd"] == "npm"
    assert data["macAuto"]["installed"] is True
    assert data["brewCalls"] == [["brew", ["install", "libomp"]]]
    assert data["macSkip"]["installed"] is False
    assert "brew install libomp" in data["macSkip"]["hint"]
    assert "Visual C++" in data["winLgbHint"]
    assert "brew install libomp" in data["macLgbHint"]
    assert "API_PORT" in data["apiPortHint"]
    assert "WEB_PORT" in data["webPortHint"]
    assert data["busyCheck"]["available"] is False


def test_sec_2_and_sec_6_ops_loopback_prod_xff_and_non_ascii(monkeypatch: pytest.MonkeyPatch) -> None:
    """SEC-2 & SEC-6: /api/v1/ops fails closed on remote/proxied/prod; non-ASCII & whitespace tokens -> 401."""
    monkeypatch.setenv("OPS_TOKEN", "")
    monkeypatch.setenv("APP_ENV", "dev")
    get_settings.cache_clear()
    try:
        app = create_app()

        async def _probe_dev() -> None:
            async with app.router.lifespan_context(app):
                st_ok, hdr_ok, _, _ = await _asgi_call(app, "GET", "/api/v1/ops", client=("127.0.0.1", 5000))
                assert st_ok == 200
                assert hdr_ok.get("cache-control") == "no-store"

                st_v6, _, _, _ = await _asgi_call(app, "GET", "/api/v1/ops", client=("::1", 5000))
                assert st_v6 == 200

                st_rem, hdr_rem, _, _ = await _asgi_call(
                    app, "GET", "/api/v1/ops", client=("203.0.113.42", 5000)
                )
                assert st_rem == 401
                assert hdr_rem["content-type"].startswith("application/problem+json")
                assert hdr_rem.get("cache-control") == "no-store"

                st_xff, _, _, _ = await _asgi_call(
                    app,
                    "GET",
                    "/api/v1/ops",
                    headers=[(b"x-forwarded-for", b"203.0.113.42")],
                    client=("127.0.0.1", 5000),
                )
                assert st_xff == 401

        asyncio.run(_probe_dev())

        # Production fails closed even on loopback when OPS_TOKEN is unset or whitespace-only
        for tok in ("", "   "):
            monkeypatch.setenv("APP_ENV", "production")
            monkeypatch.setenv("OPS_TOKEN", tok)
            get_settings.cache_clear()
            prod_app = create_app()
            st_prod, _, _, _ = asyncio.run(
                _asgi_call(
                    prod_app,
                    "GET",
                    "/api/v1/ops",
                    headers=[(b"x-ops-token", b"   ")] if tok else [],
                    client=("127.0.0.1", 5000),
                )
            )
            assert st_prod == 401

        # Non-ASCII X-Ops-Token must return 401 problem+json, NEVER 500 TypeError
        monkeypatch.setenv("APP_ENV", "dev")
        monkeypatch.setenv("OPS_TOKEN", "my-secret-token")
        get_settings.cache_clear()
        tok_app = create_app()
        st_na, hdr_na, _, _ = asyncio.run(
            _asgi_call(
                tok_app,
                "GET",
                "/api/v1/ops",
                headers=[(b"x-ops-token", b"caf\xe9")],
                client=("127.0.0.1", 5000),
            )
        )
        assert st_na == 401
        assert hdr_na["content-type"].startswith("application/problem+json")

        # Direct loopback helper rejects remote IPs and allows 127.0.0.1 / ::1
        assert _is_loopback_peer("127.0.0.1", "dev") is True
        assert _is_loopback_peer("::1", "dev") is True
        assert _is_loopback_peer("203.0.113.1", "test") is False
    finally:
        monkeypatch.delenv("OPS_TOKEN", raising=False)
        monkeypatch.delenv("APP_ENV", raising=False)
        get_settings.cache_clear()
        reset_runtime()


def test_sec_3_streaming_chunked_body_aborts_without_buffering() -> None:
    """SEC-3: Streaming 2 MB chunked POST aborts with 413 problem+json after reading <= 2 chunks."""
    app = create_app()
    chunks = [b"a" * 65_536 for _ in range(32)]  # 2 MB total, no Content-Length header
    st, hdrs, body, chunks_read = asyncio.run(
        _asgi_call(
            app,
            "POST",
            "/api/v1/forecast",
            headers=[
                (b"content-type", b"application/json"),
                (b"transfer-encoding", b"chunked"),
                (b"x-request-id", b"chunk-test-1"),
            ],
            chunks=chunks,
        )
    )
    assert st == 413
    assert hdrs["content-type"].startswith("application/problem+json")
    assert hdrs.get("x-request-id") == "chunk-test-1"
    assert chunks_read <= 2
    parsed = json.loads(body.decode("utf-8"))
    assert parsed["type"].endswith("/payload-too-large")
    assert parsed["request_id"] == "chunk-test-1"


def test_sec_4_log_redaction_and_request_id_sanitization_and_correlation() -> None:
    """SEC-4: Redact secrets in msg/exc, sanitize X-Request-ID, and log real request_id before reset."""
    secret_line = (
        "sk-ant-api03-12345678901234567890 sk-123456789012345678901234 "
        "AIzaSyD1234567890123456789012345678901 ghp_123456789012345678901234567890123456 "
        "xoxb-111-222-333 Bearer secret_tok_99 X-Ops-Token=ops_secret_42 "
        "password=hunter2 postgres://admin:pgpass99@db.local:5432/abhas"
    )
    redacted = redact_secrets(secret_line)
    for forbidden in (
        "sk-ant-api03",
        "sk-1234567890",
        "AIzaSyD",
        "ghp_123456",
        "xoxb-111",
        "secret_tok_99",
        "ops_secret_42",
        "hunter2",
        "pgpass99",
    ):
        assert forbidden not in redacted
    assert "postgres://admin:[REDACTED]@db.local:5432/abhas" in redacted

    # Exception traceback redaction in JsonFormatter
    fmt = JsonFormatter()
    try:
        raise ValueError("auth failed: password=hunter2 sk-ant-api03-12345678901234567890")
    except ValueError:
        rec = logging.LogRecord("abhas.test", logging.ERROR, __file__, 1, "boom", (), sys.exc_info())
    formatted = json.loads(fmt.format(rec))
    assert "hunter2" not in formatted["exc"]
    assert "sk-ant-api03" not in formatted["exc"]

    # X-Request-ID validation
    assert sanitize_request_id("valid.req_id-01") == "valid.req_id-01"
    assert sanitize_request_id("bad\x1b[31mANSI") != "bad\x1b[31mANSI"
    assert sanitize_request_id("line\r\nbreak") != "line\r\nbreak"
    assert len(sanitize_request_id("a" * 100)) == 16

    # Access log MUST carry the real request_id (not "-")
    captured: list[dict[str, Any]] = []

    class _CaptureHandler(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            captured.append(json.loads(fmt.format(record)))

    http_logger = logging.getLogger("abhas.http")
    handler = _CaptureHandler()
    http_logger.addHandler(handler)
    try:
        with TestClient(create_app()) as c:
            r = c.get("/healthz", headers={"X-Request-ID": "trace-ok-42"})
            assert r.status_code == 200
            assert r.headers["x-request-id"] == "trace-ok-42"
            r_bad = c.get("/healthz", headers={"X-Request-ID": "bad\x1b[31mANSI"})
            assert r_bad.headers["x-request-id"] != "bad\x1b[31mANSI"
    finally:
        http_logger.removeHandler(handler)

    assert any(
        entry.get("request_id") == "trace-ok-42" and entry.get("route") == "/healthz" for entry in captured
    )
    assert request_id_var.get() == "-"


def test_sec_7_and_sec_11_problem_json_404_405_500_headers_and_prod_docs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """SEC-7 & SEC-11: 404/405 problem+json, 500 keeps CORS + X-Request-ID, security headers, prod docs off."""
    app = create_app()

    @app.get("/_test_unhandled_boom")
    def _boom() -> dict[str, str]:
        raise RuntimeError("secret=sk-ant-api03-12345678901234567890")

    captured_err: list[dict[str, Any]] = []
    fmt = JsonFormatter()

    class _ErrCapture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            if record.levelno >= logging.ERROR:
                captured_err.append(json.loads(fmt.format(record)))

    root_abhas = logging.getLogger("abhas")
    err_handler = _ErrCapture()
    root_abhas.addHandler(err_handler)
    try:
        with TestClient(app) as c:
            r404 = c.get("/api/v1/does-not-exist")
            assert r404.status_code == 404
            assert r404.headers["content-type"].startswith("application/problem+json")
            assert r404.json()["type"].endswith("/not-found")

            r405 = c.delete("/api/v1/wards")
            assert r405.status_code == 405
            assert r405.headers["content-type"].startswith("application/problem+json")
            assert r405.json()["type"].endswith("/method-not-allowed")

            r500 = c.get(
                "/_test_unhandled_boom",
                headers={"Origin": "http://localhost:3000", "X-Request-ID": "boom-req-7"},
            )
            assert r500.status_code == 500
            assert r500.headers["content-type"].startswith("application/problem+json")
            assert r500.headers.get("x-request-id") == "boom-req-7"
            assert r500.headers.get("access-control-allow-origin") == "http://localhost:3000"
            assert r500.headers.get("x-content-type-options") == "nosniff"
            assert r500.headers.get("x-frame-options") == "DENY"
            assert r500.headers.get("referrer-policy") == "no-referrer"
            body500 = r500.json()
            assert body500["request_id"] == "boom-req-7"
            assert "sk-ant-" not in r500.text
            assert "Traceback" not in r500.text

            r_hz = c.get("/healthz")
            assert r_hz.headers.get("cache-control") == "no-store"
            assert r_hz.headers.get("x-content-type-options") == "nosniff"

            r_rz = c.get("/readyz")
            assert r_rz.status_code == 200
            assert r_rz.headers.get("cache-control") == "no-store"
            assert r_rz.json()["checks"] == {
                "database": True,
                "model": True,
                "supply_ratios": True,
                "ward_capacity": True,
                "trigger_evaluation": True,
                "structural_planner": True,
            }
    finally:
        root_abhas.removeHandler(err_handler)

    assert any(e.get("request_id") == "boom-req-7" for e in captured_err)
    assert all("sk-ant-api03" not in json.dumps(e) for e in captured_err)

    # Production disables /docs, /redoc, /openapi.json
    monkeypatch.setenv("APP_ENV", "production")
    get_settings.cache_clear()
    try:
        prod_app = create_app()
        for doc_path in ("/docs", "/redoc", "/openapi.json"):
            st, _, _, _ = asyncio.run(_asgi_call(prod_app, "GET", doc_path))
            assert st == 404
    finally:
        monkeypatch.delenv("APP_ENV", raising=False)
        get_settings.cache_clear()


def test_sec_8_rate_limit_exact_exempt_trusted_proxies_and_lru(monkeypatch: pytest.MonkeyPatch) -> None:
    """SEC-8: Exact EXEMPT matching, opt-in TRUSTED_PROXIES rightmost untrusted XFF, and LRU eviction."""
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "2")
    monkeypatch.setenv("TRUSTED_PROXIES", "10.0.0.1")
    get_settings.cache_clear()
    try:
        app = create_app()

        async def _probe() -> None:
            async with app.router.lifespan_context(app):
                # 1. /docs_not_real must NOT be exempt
                statuses = [
                    (await _asgi_call(app, "GET", "/docs_not_real", client=("198.51.100.10", 1234)))[0]
                    for _ in range(3)
                ]
                assert statuses == [404, 404, 429]

                # 2. Behind trusted proxy 10.0.0.1, rightmost untrusted XFF isolates clients
                for _ in range(2):
                    st, _, _, _ = await _asgi_call(
                        app,
                        "GET",
                        "/api/v1/wards",
                        headers=[(b"x-forwarded-for", b"1.1.1.1, 198.51.100.1")],
                        client=("10.0.0.1", 1234),
                    )
                    assert st == 200
                st_blocked, hdrs_429, _, _ = await _asgi_call(
                    app,
                    "GET",
                    "/api/v1/wards",
                    headers=[(b"x-forwarded-for", b"2.2.2.2, 198.51.100.1")],
                    client=("10.0.0.1", 1234),
                )
                assert st_blocked == 429
                assert int(hdrs_429["retry-after"]) >= 1

                # Distinct client behind same trusted proxy is NOT blocked
                st_other, _, _, _ = await _asgi_call(
                    app,
                    "GET",
                    "/api/v1/wards",
                    headers=[(b"x-forwarded-for", b"198.51.100.2")],
                    client=("10.0.0.1", 1234),
                )
                assert st_other == 200

                # Untrusted peer CANNOT spoof X-Forwarded-For
                for _ in range(2):
                    st_u, _, _, _ = await _asgi_call(
                        app,
                        "GET",
                        "/api/v1/wards",
                        headers=[(b"x-forwarded-for", b"198.51.100.99")],
                        client=("203.0.113.7", 1234),
                    )
                    assert st_u == 200
                st_u3, _, _, _ = await _asgi_call(
                    app,
                    "GET",
                    "/api/v1/wards",
                    headers=[(b"x-forwarded-for", b"198.51.100.100")],
                    client=("203.0.113.7", 1234),
                )
                assert st_u3 == 429

        asyncio.run(_probe())

        # 3. LRU eviction keeps active early-inserted key and evicts least-recently-used key
        async def _dummy(scope: Any, receive: Any, send: Any) -> None:
            pass

        mw = RateLimitMiddleware(_dummy, per_minute=5)
        now = 1000.0
        mw.hits["active_abuser"].append(now - 0.1)  # inserted first, but most recently active!
        mw.hits["idle_old"].append(now - 50.0)  # oldest last-hit timestamp
        for i in range(MAX_TRACKED_KEYS):
            mw.hits[f"ip-{i}"].append(now - 10.0)
        mw._evict_stale(now)
        assert "active_abuser" in mw.hits
        assert "idle_old" not in mw.hits
    finally:
        monkeypatch.delenv("RATE_LIMIT_PER_MINUTE", raising=False)
        monkeypatch.delenv("TRUSTED_PROXIES", raising=False)
        get_settings.cache_clear()


def test_sec_10_settings_validation() -> None:
    """SEC-10: Settings rejects wildcard/null CORS, SSRF Open-Meteo URLs, and non-positive timeouts."""
    for bad_cors in (
        "*",
        "null",
        "http://localhost:3000,*",
        "ftp://example.com",
        "http://localhost:3000/path",
    ):
        with pytest.raises(ValidationError):
            Settings(cors_origins=bad_cors)

    for bad_url in (
        "http://169.254.169.254/latest/meta-data/",
        "http://api.open-meteo.com/v1/forecast",
        "https://127.0.0.1/v1/forecast",
        "https://10.0.0.1/v1/forecast",
        "https://[::1]/v1/forecast",
        "https://localhost/v1/forecast",
        "https://metadata.google.internal/computeMetadata/v1/",
    ):
        with pytest.raises(ValidationError):
            Settings(app_env="dev", open_meteo_base_url=bad_url)

    # HTTP local mock URL is allowed strictly in APP_ENV=test
    test_cfg = Settings(app_env="test", open_meteo_base_url="http://127.0.0.1:9999/v1/forecast")
    assert test_cfg.open_meteo_base_url == "http://127.0.0.1:9999/v1/forecast"
    assert active_faults(Settings(app_env="dev", fault_inject="db_down")) == frozenset()

    for kwargs in (
        {"weather_connect_timeout_s": 0},
        {"weather_connect_timeout_s": -1},
        {"weather_read_timeout_s": 0},
        {"llm_timeout_s": -5},
        {"weather_cache_ttl_hours": -1},
        {"llm_daily_budget_usd": 0},
    ):
        with pytest.raises(ValidationError):
            Settings(**kwargs)


def test_sec_12_forbid_extra_fields_and_non_finite_floats() -> None:
    """SEC-12: Unknown JSON fields and NaN/Infinity floats return 422 problem+json."""
    with TestClient(create_app()) as c:
        r_extra_fc = c.post(
            "/api/v1/forecast",
            json={"ward_ids": ["DSCC_Ward_07"], "origin_week": "2025-08-04", "unexpected": 1},
        )
        assert r_extra_fc.status_code == 422
        assert r_extra_fc.headers["content-type"].startswith("application/problem+json")

        r_extra_w = c.post(
            "/api/v1/scenario",
            json={
                "ward_id": "DSCC_Ward_07",
                "origin_week": "2025-08-04",
                "weather": {"rainfall_mm": 50.0, "injected": 9},
            },
        )
        assert r_extra_w.status_code == 422

        r_extra_adv = c.post(
            "/api/v1/advisory",
            json={"ward_id": "DSCC_Ward_07", "origin_week": "2025-08-04", "extra": "nope"},
        )
        assert r_extra_adv.status_code == 422

        for raw in (
            '{"ward_id":"DSCC_Ward_07","origin_week":"2025-08-04","weather":{"rainfall_mm":NaN}}',
            '{"ward_id":"DSCC_Ward_07","origin_week":"2025-08-04","weather":{"avg_temp_c":Infinity}}',
            '{"ward_id":"DSCC_Ward_07","origin_week":"2025-08-04","weather":{"relative_humidity_pct":-Infinity}}',
        ):
            r_nf = c.post(
                "/api/v1/scenario", content=raw.encode(), headers={"Content-Type": "application/json"}
            )
            assert r_nf.status_code == 422
            assert r_nf.headers["content-type"].startswith("application/problem+json")


def test_csv_formula_injection_sanitizer() -> None:
    """Spreadsheet formula prefixes are neutralized with a leading single quote."""
    for dangerous in ("=1+1", "+cmd", "-2+3", "@SUM(A1)", "\t=1", "  =HYPERLINK()"):
        assert sanitize_csv_cell(dangerous).startswith("'")
    assert sanitize_csv_cell("DSCC_Ward_07") == "DSCC_Ward_07"
    assert sanitize_csv_cell(42) == "42"


def test_py_runner_reports_clear_api_port_in_use_error() -> None:
    """scripts/py.mjs detects an occupied API port before launching uvicorn and prints API_PORT hint."""
    import socket

    py_script = REPO_ROOT / "scripts" / "py.mjs"
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as srv:
        srv.bind(("127.0.0.1", 0))
        srv.listen(1)
        busy_port = srv.getsockname()[1]
        proc = subprocess.run(
            ["node", str(py_script), "-m", "app", "--port", str(busy_port), "--no-reload"],
            capture_output=True,
            text=True,
            check=False,
        )
    assert proc.returncode != 0
    assert str(busy_port) in proc.stderr
    assert "API_PORT" in proc.stderr


def test_xff_spoof_does_not_reset_rate_limit() -> None:
    """Q1: Uvicorn proxy_headers=False prevents localhost clients from bypassing rate limits via X-Forwarded-For."""
    import os
    import socket
    import sys
    import time
    import urllib.error
    import urllib.request

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as srv:
        srv.bind(("127.0.0.1", 0))
        free_port = srv.getsockname()[1]

    env = dict(os.environ)
    env["APP_ENV"] = "test"
    env["RATE_LIMIT_PER_MINUTE"] = "5"
    env["TRUSTED_PROXIES"] = ""
    env["ABHAS_OFFLINE"] = "1"

    proc = subprocess.Popen(
        [sys.executable, "-m", "app", "--env", "test", "--port", str(free_port), "--no-reload"],
        cwd=str(REPO_ROOT / "apps" / "api"),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    base = f"http://127.0.0.1:{free_port}"
    try:
        deadline = time.monotonic() + 30.0
        ready = False
        while time.monotonic() < deadline and proc.poll() is None:
            try:
                with urllib.request.urlopen(f"{base}/healthz", timeout=2.0) as resp:
                    if resp.status == 200:
                        ready = True
                        break
            except Exception:  # noqa: BLE001
                time.sleep(0.2)
        assert ready, f"API failed to boot on port {free_port}"

        def _get(headers: dict[str, str] | None = None) -> int:
            req = urllib.request.Request(f"{base}/api/v1/plans?limit=1", headers=headers or {})
            try:
                with urllib.request.urlopen(req, timeout=5.0) as r:
                    return int(r.status)
            except urllib.error.HTTPError as err:
                return int(err.code)

        statuses = [_get() for _ in range(6)]
        assert statuses[:5] == [200, 200, 200, 200, 200], statuses
        assert statuses[5] == 429, statuses

        spoofed = _get({"X-Forwarded-For": "203.0.113.1"})
        assert spoofed == 429, f"Expected 429 on spoofed X-Forwarded-For, got {spoofed}"
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
