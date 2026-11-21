"""PRD Acceptance Criteria traceability tests for AC-9 and AC-12.

Satisfies `node .orca-team/tools/gates.mjs prd --strict` requirements.
"""

from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app

REPO_ROOT = Path(__file__).resolve().parents[3]


def test_ac_9_zero_key_readyz_and_launch_contract():
    """AC-9: Given a fresh clone with Python 3.12 and Node 22, the app launches with zero keys and /readyz is 200."""
    app = create_app()
    with TestClient(app) as client:
        res = client.get("/readyz")
        assert res.status_code == 200, f"Expected /readyz 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data.get("status") == "ready"
        checks = data.get("checks", {})
        assert checks.get("database") is True
        assert checks.get("model") is True


def test_ac_12_readme_disclosure_and_model_card():
    """AC-12: README lists AI assistants, Open-Meteo, fonts, zero-key commands, and simulated data caveat."""
    readme_path = REPO_ROOT / "README.md"
    assert readme_path.exists(), "README.md must exist in repo root"
    readme = readme_path.read_text(encoding="utf-8")

    # Launch commands
    assert "npm run setup" in readme
    assert "npm run dev" in readme

    # AI Assistants disclosure
    assert "Claude" in readme or "Opus" in readme
    assert "Gemini" in readme or "Neon" in readme

    # External services & licences
    assert "Open-Meteo" in readme
    assert "CC BY 4.0" in readme
    assert "SIL" in readme or "OFL" in readme or "Open Font" in readme

    # Model card & simulated data disclosure
    assert "simulated" in readme.lower() or "synthetic" in readme.lower()
    assert "DGHS" in readme

    # Verify model card file
    model_card_path = REPO_ROOT / "docs" / "model-card.md"
    assert model_card_path.exists(), "docs/model-card.md must exist"
    model_card = model_card_path.read_text(encoding="utf-8")
    assert "DGHS" in model_card
    assert "simulated" in model_card.lower() or "synthetic" in model_card.lower()
