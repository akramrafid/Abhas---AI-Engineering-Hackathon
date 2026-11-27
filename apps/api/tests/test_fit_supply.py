"""WP0b verification tests: ml/fit_supply.py, config JSONs, S0 mapping, SHA guard, idempotence."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import API_DIR, REPO_ROOT
from app.main import create_app
from ml.fit_supply import (
    DEFAULT_CAPACITY_OUT,
    DEFAULT_INPUT_PATH,
    DEFAULT_SUPPLY_OUT,
    EXPECTED_ONSITE_SHA256,
    SUPPLY_CONSTANTS,
    round_half_up,
    run_fit_supply,
)


def test_wp0b_s0_exact_mapping() -> None:
    """Algorithms §1 case S0: exact round_half_up(c * k) tuples for k = 0, 1, 2, 5, 10, 15, 20."""
    expected = {
        0: (0, 0, 0),
        1: (2, 1, 0),
        2: (5, 2, 1),
        5: (12, 6, 1),
        10: (24, 12, 3),
        15: (36, 17, 4),
        20: (48, 23, 6),
    }
    for k, want in expected.items():
        got = (
            round_half_up(SUPPLY_CONSTANTS["saline_bags"] * k),
            round_half_up(SUPPLY_CONSTANTS["diagnostic_kits"] * k),
            round_half_up(SUPPLY_CONSTANTS["hospital_beds"] * k),
        )
        assert got == want, f"S0 mismatch at k={k}: got {got}, want {want}"


def test_wp0b_1_and_2_committed_configs_and_idempotence(tmp_path: Path) -> None:
    """WP0b-1 & WP0b-2: committed JSON configs match 2.385/1.164/0.298, 100% row_match, 60 wards, 3-7 beds, sum 284."""
    assert DEFAULT_SUPPLY_OUT.exists(), "apps/api/config/supply_ratios.json missing"
    assert DEFAULT_CAPACITY_OUT.exists(), "apps/api/config/ward_capacity.json missing"

    supply = json.loads(DEFAULT_SUPPLY_OUT.read_text(encoding="utf-8"))
    cap = json.loads(DEFAULT_CAPACITY_OUT.read_text(encoding="utf-8"))

    assert supply["dataset_sha256"] == EXPECTED_ONSITE_SHA256
    assert supply["ratios"] == {
        "saline_bags": 2.385,
        "diagnostic_kits": 1.164,
        "hospital_beds": 0.298,
    }
    assert supply["row_match"] == {
        "saline_bags": 1.0,
        "diagnostic_kits": 1.0,
        "hospital_beds": 1.0,
    }

    assert cap["dataset_sha256"] == EXPECTED_ONSITE_SHA256
    assert cap["fitted_years"] == [2016, 2022]
    assert "no capacity column" in cap["assumption"].lower()
    wards = cap["wards"]
    assert len(wards) == 60
    assert min(wards.values()) == 3
    assert max(wards.values()) == 7
    assert sum(wards.values()) == 284
    assert cap["total_beds"] == 284

    # Idempotence: running twice produces byte-identical files matching the committed configs
    s1 = tmp_path / "supply_1.json"
    c1 = tmp_path / "cap_1.json"
    s2 = tmp_path / "supply_2.json"
    c2 = tmp_path / "cap_2.json"
    run_fit_supply(input_path=DEFAULT_INPUT_PATH, supply_out=s1, capacity_out=c1)
    run_fit_supply(input_path=DEFAULT_INPUT_PATH, supply_out=s2, capacity_out=c2)

    assert s1.read_bytes() == s2.read_bytes() == DEFAULT_SUPPLY_OUT.read_bytes()
    assert c1.read_bytes() == c2.read_bytes() == DEFAULT_CAPACITY_OUT.read_bytes()


def test_wp0b_3_sha_guard_refuses_tampered_file_and_writes_nothing(tmp_path: Path) -> None:
    """WP0b-3: altered SHA-256 exits non-zero and writes neither config file."""
    tampered = tmp_path / "tampered.xlsx"
    raw = bytearray(DEFAULT_INPUT_PATH.read_bytes())
    raw[-1] ^= 0x01
    tampered.write_bytes(bytes(raw))

    s_out = tmp_path / "should_not_exist_supply.json"
    c_out = tmp_path / "should_not_exist_cap.json"
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "ml.fit_supply",
            "--input",
            str(tampered),
            "--supply-out",
            str(s_out),
            "--capacity-out",
            str(c_out),
        ],
        cwd=str(API_DIR),
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode != 0
    assert "SHA-256 mismatch" in proc.stderr
    assert not s_out.exists()
    assert not c_out.exists()


def test_wp0b_4_allocation_stub_reports_exact_supply_ratios() -> None:
    """WP0b-4: POST /api/v1/allocation/plan returns 2.385 / 1.164 / 0.298 supply_ratios."""
    assert (REPO_ROOT / "apps" / "api" / "config" / "supply_ratios.json").exists()
    with TestClient(create_app()) as client:
        resp = client.post(
            "/api/v1/allocation/plan",
            json={"scope": "Dhaka South", "origin_week": "2024-08-05", "stock_pct": 60, "total_crews": 10},
        )
        assert resp.status_code == 200
        assert resp.json()["supply_ratios"] == {
            "saline_bags": 2.385,
            "diagnostic_kits": 1.164,
            "hospital_beds": 0.298,
        }
