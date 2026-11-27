"""LEAD skeleton tests: health, problem+json errors and contract drift."""

import json
import subprocess
import sys
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import inspect

from app.adapters.db.factory import ensure_database_ready, reset_factory
from app.core.config import API_DIR, Settings, active_faults, get_settings
from app.core.readiness import register_readiness_check, unregister_readiness_check
from app.main import create_app

REPO_ROOT = Path(__file__).resolve().parents[3]
CONTRACT = REPO_ROOT / "contracts" / "openapi.json"
SETUP_SCRIPT = REPO_ROOT / "scripts" / "setup.mjs"


def client() -> TestClient:
    return TestClient(create_app())


def test_healthz_and_readyz() -> None:
    with client() as c:
        assert c.get("/healthz").json() == {"status": "ok"}
        assert c.get("/readyz").status_code == 200


def test_validation_error_is_problem_json() -> None:
    with client() as c:
        r = c.post("/api/v1/forecast", json={"ward_ids": [], "origin_week": "2025-08-05"})
    assert r.status_code == 422
    assert r.headers["content-type"].startswith("application/problem+json")
    fields = {e["field"] for e in r.json()["errors"]}
    assert any("ward_ids" in f for f in fields) and any("origin_week" in f for f in fields)


def test_contract_has_not_drifted() -> None:
    """Fails when code and the committed contract differ: run `npm run contracts` and commit."""
    assert CONTRACT.exists(), "contracts/openapi.json missing — run npm run contracts"
    committed = json.loads(CONTRACT.read_text(encoding="utf-8"))
    assert committed == json.loads(json.dumps(create_app().openapi(), sort_keys=True))


def test_cr_1_setup_zero_shell_and_metachar_safe() -> None:
    """CR-1 / SEC-1: setup.mjs never invokes a shell and handles spaces & Windows metacharacters safely."""
    src = SETUP_SCRIPT.read_text(encoding="utf-8")
    assert "shell: true" not in src

    setup_url = SETUP_SCRIPT.as_uri()
    exe_path = str(Path(sys.executable).resolve())
    js = (
        f"import {{ spawnSync }} from 'node:child_process'; "
        f"import {{ useShell, resolveNpmInvocation }} from {json.dumps(setup_url)}; "
        f"const winShim = useShell('npm', true); "
        f"const winUv = useShell('uv', true); "
        f"const winAbs = useShell('C:\\\\Users\\\\First Last & Co\\\\repo\\\\apps\\\\api\\\\.venv\\\\Scripts\\\\python.exe', true); "
        f"const posixAbs = useShell('/tmp/dir with space/python', false); "
        f"const npmInv = resolveNpmInvocation("
        f"  {{ npm_execpath: 'C:\\\\Program Files\\\\Alice & Bob\\\\npm-cli.js' }}, "
        f"  true, "
        f"  'C:\\\\Program Files\\\\Alice & Bob\\\\node.exe'"
        f"); "
        f"const exe = {json.dumps(exe_path)}; "
        f"const r = spawnSync(exe, ['--version'], {{ shell: useShell(exe), encoding: 'utf8' }}); "
        f"console.log(JSON.stringify({{ winShim, winUv, winAbs, posixAbs, npmInv, status: r.status, out: (r.stdout || r.stderr || '').trim() }}));"
    )
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", js], capture_output=True, text=True, check=False
    )
    assert proc.returncode == 0, f"node failed: {proc.stderr}"
    data = json.loads(proc.stdout.strip())
    assert data["winShim"] is False
    assert data["winUv"] is False
    assert data["winAbs"] is False
    assert data["posixAbs"] is False
    assert data["npmInv"]["cmd"] == "C:\\Program Files\\Alice & Bob\\node.exe"
    assert data["npmInv"]["args"][:2] == ["C:\\Program Files\\Alice & Bob\\npm-cli.js", "ci"]
    assert "--ignore-scripts" in data["npmInv"]["args"]
    assert data["status"] == 0
    assert data["out"].startswith("Python ")


def test_cr_10_app_env_prod_normalizes_to_production(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """CR-10: APP_ENV=prod must normalize to 'production' so production guards apply."""
    monkeypatch.setenv("APP_ENV", "prod")
    cfg = Settings()
    assert cfg.app_env == "production"
    assert active_faults(Settings(fault_inject="openmeteo_5xx")) == frozenset()

    monkeypatch.setenv("APP_ENV", "PROD")
    assert Settings().app_env == "production"

    monkeypatch.setenv("APP_ENV", "staging")
    with pytest.raises(ValidationError):
        Settings()

    # Production DB guard: APP_ENV=prod must NOT auto-migrate or auto-seed an empty database.
    empty_db = tmp_path / "prod_empty.sqlite"
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{empty_db.as_posix()}")
    get_settings.cache_clear()
    reset_factory()
    try:
        engine = ensure_database_ready()
        assert not inspect(engine).has_table("wards")
    finally:
        reset_factory()
        get_settings.cache_clear()


def test_cr_16_readyz_requires_migrated_and_seeded_db(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """CR-16: /readyz must fail 503 when DB is unmigrated or has zero wards, and pass 200 when seeded."""
    # Unmigrated DB in production (auto-migrate skipped)
    unmigrated_db = tmp_path / "unmigrated.sqlite"
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{unmigrated_db.as_posix()}")
    get_settings.cache_clear()
    reset_factory()
    try:
        app = create_app()
        assert app.state.ready is False
        with TestClient(app) as c:
            assert c.get("/healthz").status_code == 200
            r = c.get("/readyz")
        assert r.status_code == 503
        assert r.headers["content-type"].startswith("application/problem+json")
        body = r.json()
        assert body["type"].endswith("/not-ready")
        assert "database" in body["detail"]
    finally:
        reset_factory()
        get_settings.cache_clear()

    # Migrated DB with 0 wards in production (auto-seed skipped)
    empty_migrated_db = tmp_path / "empty_migrated.sqlite"
    url = f"sqlite:///{empty_migrated_db.as_posix()}"
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.attributes["url"] = url
    command.upgrade(cfg, "head")

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    reset_factory()
    try:
        with TestClient(create_app()) as c:
            r = c.get("/readyz")
        assert r.status_code == 503
        assert r.headers["content-type"].startswith("application/problem+json")
        assert "database" in r.json()["detail"]
    finally:
        reset_factory()
        get_settings.cache_clear()


def test_cr_16_readyz_extensible_checks_hook() -> None:
    """CR-16: /readyz exposes app.state.checks and register_readiness_check for CORE model readiness."""
    # 1. Direct app.state.checks extension (bool, callable, and failing callable)
    app = create_app()
    with TestClient(app) as c:
        ok = c.get("/readyz")
        assert ok.status_code == 200
        assert ok.json()["checks"]["database"] is True

        app.state.checks["model"] = False
        not_ready = c.get("/readyz")
        assert not_ready.status_code == 503
        assert "model" in not_ready.json()["detail"]

        app.state.checks["model"] = lambda: True
        ready_again = c.get("/readyz")
        assert ready_again.status_code == 200
        assert ready_again.json()["checks"]["model"] is True

        def _boom() -> bool:
            raise RuntimeError("artifact sha mismatch")

        app.state.checks["model"] = _boom
        errored = c.get("/readyz")
        assert errored.status_code == 503
        assert "model" in errored.json()["detail"]

    # 2. Registry hook usable by slices without modifying app/main.py
    state = {"loaded": False}
    register_readiness_check("model", lambda: state["loaded"])
    try:
        with TestClient(create_app()) as c:
            r_fail = c.get("/readyz")
            assert r_fail.status_code == 503
            assert "model" in r_fail.json()["detail"]

            state["loaded"] = True
            r_ok = c.get("/readyz")
            assert r_ok.status_code == 200
            assert r_ok.json()["checks"] == {
                "database": True,
                "model": True,
                "supply_ratios": True,
                "ward_capacity": True,
                "trigger_evaluation": True,
                "structural_planner": True,
            }
    finally:
        unregister_readiness_check("model")
