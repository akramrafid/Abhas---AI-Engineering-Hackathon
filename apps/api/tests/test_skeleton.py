"""LEAD skeleton tests: health, problem+json errors and contract drift."""

import json
import subprocess
import sys
from pathlib import Path

from fastapi.testclient import TestClient

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


def test_cr_1_setup_bypasses_shell_for_absolute_exe_paths() -> None:
    """CR-1: setup.mjs must use shell only for PATH shims and bypass shell for absolute exe paths."""
    setup_url = SETUP_SCRIPT.as_uri()
    exe_path = str(Path(sys.executable).resolve())
    js = (
        f"import {{ spawnSync }} from 'node:child_process'; "
        f"import {{ useShell }} from {json.dumps(setup_url)}; "
        f"const winShim = useShell('npm', true); "
        f"const winAbs = useShell('C:\\\\Users\\\\First Last\\\\repo\\\\apps\\\\api\\\\.venv\\\\Scripts\\\\python.exe', true); "
        f"const posixAbs = useShell('/tmp/dir with space/python', false); "
        f"const exe = {json.dumps(exe_path)}; "
        f"const r = spawnSync(exe, ['--version'], {{ shell: useShell(exe), encoding: 'utf8' }}); "
        f"console.log(JSON.stringify({{ winShim, winAbs, posixAbs, status: r.status, out: (r.stdout || r.stderr || '').trim() }}));"
    )
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", js], capture_output=True, text=True, check=False
    )
    assert proc.returncode == 0, f"node failed: {proc.stderr}"
    data = json.loads(proc.stdout.strip())
    assert data["winShim"] is True
    assert data["winAbs"] is False
    assert data["posixAbs"] is False
    assert data["status"] == 0
    assert data["out"].startswith("Python ")
