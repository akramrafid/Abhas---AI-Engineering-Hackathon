"""Integration tests for QA r1 hardening findings (CR-4, CR-5, CR-6, CR-14, CR-15)."""

from __future__ import annotations

import json
import logging
import shutil
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pandas as pd
import pytest

from app.ports.forecast_model import PointForecast
from evals import run as run_mod
from evals import scoring as scoring_mod
from scripts.seed import EXPECTED_SHA256


def _mini_dataset(n_weeks: int = 16, start: date = date(2024, 1, 1)) -> pd.DataFrame:
    """Build a small consecutive weekly DataFrame for unit/integration eval tests."""
    rows: list[dict[str, Any]] = []
    for wid, city in (("DSCC_Ward_04", "Dhaka South"), ("DNCC_Ward_04", "Dhaka North")):
        for i in range(n_weeks):
            dt = start + timedelta(weeks=i)
            rows.append(
                {
                    "date": dt,
                    "city": city,
                    "ward_id": wid,
                    "population_density_sqkm": 42000.0,
                    "water_logging_risk_index": 0.75,
                    "sanitation_score": 0.55,
                    "avg_temp_c": 27.5,
                    "max_temp_c": 32.0,
                    "min_temp_c": 23.0,
                    "rainfall_mm": 40.0 + float(i % 5) * 10.0,
                    "relative_humidity_pct": 75.0,
                    "dengue_cases": 2 if i % 4 != 3 else 15,
                    "year": dt.year,
                    "iso_week": scoring_mod.iso_week_capped(dt),
                }
            )
    return pd.DataFrame(rows)


class _DummyCoreModel:
    """Minimal ForecastModel double for CR-5 / CR-6 / CR-15 tests."""

    def __init__(
        self,
        *,
        version: str = "dummy-1.0",
        train_end_year: int = 2023,
        max_normal_year: int = 2023,
        rain_normals: dict[tuple[str, int], float] | None = None,
        single_row_delay_s: float = 0.0,
        perfect_actuals: dict[tuple[float, int], float] | None = None,
    ) -> None:
        self.version = version
        self.feature_names = ("rainfall_lag_0", "row_actual")
        self.train_end_year = train_end_year
        self.max_normal_year = max_normal_year
        self.rain_normals = rain_normals or {("DSCC_Ward_04", 1): 12.5}
        self._single_row_delay_s = single_row_delay_s
        self._perfect_actuals = perfect_actuals
        self.single_row_calls = 0
        self.batch_calls = 0

    def predict(self, rows: list[dict[str, float]], horizon: int) -> list[PointForecast]:
        if len(rows) == 1:
            self.single_row_calls += 1
            if self._single_row_delay_s > 0:
                time.sleep(self._single_row_delay_s)
        else:
            self.batch_calls += 1

        out: list[PointForecast] = []
        for row in rows:
            actual = float(row.get("row_actual", 2.0))
            tier = scoring_mod.tier_from_cases(actual)
            out.append(
                PointForecast(
                    expected_cases=actual,
                    p10=max(0.0, actual - 1.0),
                    p90=actual + 1.0,
                    risk_score=80 if tier in ("High", "Critical") else 10,
                    tier=tier,
                    tier_escalated=False,
                    contributions={},
                )
            )
        return out


# ---------------------------------------------------------------------------
# CR-4: --lock immutability / --relock audit, mandatory lock check, dataset SHA
# ---------------------------------------------------------------------------


def test_cr_4_lock_refuses_overwrite_without_relock_and_logs_relock(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """CR-4: --lock refuses to overwrite an existing heldout_sha256 unless --relock is passed and logged."""
    tmp_cfg = tmp_path / "config.json"
    tmp_hist = tmp_path / "history.jsonl"
    shutil.copyfile(run_mod.CONFIG_PATH, tmp_cfg)
    raw = json.loads(tmp_cfg.read_text(encoding="utf-8"))
    old_sha = "0" * 64
    raw["heldout_sha256"] = old_sha
    tmp_cfg.write_text(json.dumps(raw, indent=2), encoding="utf-8")

    monkeypatch.setattr(run_mod, "CONFIG_PATH", tmp_cfg)
    monkeypatch.setattr(run_mod, "HISTORY_PATH", tmp_hist)

    # Without --relock: must refuse with TAMPER_EXIT_CODE (3) and leave config untouched.
    rc = run_mod.main(["--lock"])
    captured = capsys.readouterr()
    assert rc == run_mod.TAMPER_EXIT_CODE
    assert "already locked" in captured.err.lower()
    assert "--relock" in captured.err.lower()
    assert json.loads(tmp_cfg.read_text(encoding="utf-8"))["heldout_sha256"] == old_sha
    assert not tmp_hist.exists()

    # With --relock: updates heldout_sha256 and appends an audit record to history.jsonl.
    rc_relock = run_mod.main(["--lock", "--relock"])
    captured_relock = capsys.readouterr()
    assert rc_relock == 0
    assert "relocking" in captured_relock.err.lower()
    expected_sha = run_mod.compute_heldout_sha256(run_mod.load_forecast_cases())
    assert json.loads(tmp_cfg.read_text(encoding="utf-8"))["heldout_sha256"] == expected_sha

    entries = [json.loads(line) for line in tmp_hist.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert len(entries) == 1
    assert entries[0]["event"] == "relock"
    assert entries[0]["previous_sha256"] == old_sha
    assert entries[0]["new_sha256"] == expected_sha


def test_cr_4_missing_heldout_sha_refuses_heldout_and_all(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """CR-4: tamper check is never skipped when heldout_sha256 is null/missing for heldout or all."""
    tmp_cfg = tmp_path / "config.json"
    shutil.copyfile(run_mod.CONFIG_PATH, tmp_cfg)
    raw = json.loads(tmp_cfg.read_text(encoding="utf-8"))
    raw["heldout_sha256"] = None
    tmp_cfg.write_text(json.dumps(raw, indent=2), encoding="utf-8")

    monkeypatch.setattr(run_mod, "CONFIG_PATH", tmp_cfg)

    for split in ("heldout", "all"):
        rc = run_mod.main(["--split", split])
        captured = capsys.readouterr()
        assert rc == run_mod.TAMPER_EXIT_CODE, f"--split {split} must exit 3 when heldout_sha256 is null"
        assert "heldout_sha256" in captured.err


def test_cr_4_load_raw_dataset_verifies_expected_sha256(tmp_path: Path) -> None:
    """CR-4: load_raw_dataset verifies EXPECTED_SHA256 from scripts.seed and raises on mismatch."""
    tampered = tmp_path / "tampered_dataset.xlsx"
    tampered.write_bytes(b"not-the-organisers-dataset")

    with pytest.raises(ValueError, match="SHA-256 mismatch") as exc_info:
        scoring_mod.load_raw_dataset(path=tampered)
    assert EXPECTED_SHA256 in str(exc_info.value)

    # Authentic dataset succeeds and yields all 31,320 rows.
    df = scoring_mod.load_raw_dataset()
    assert len(df) == 31_320


# ---------------------------------------------------------------------------
# CR-5: rain_normals / max_normal_year forwarding & --split dev refusal
# ---------------------------------------------------------------------------


def test_cr_5_feature_lookup_forwards_artifact_rain_normals_and_max_normal_year() -> None:
    """CR-5: _build_feature_lookup passes the artifact's rain_normals and max_normal_year."""
    df = _mini_dataset(n_weeks=12, start=date(2024, 1, 1))
    clim = scoring_mod.ClimatologyBaseline.fit(df, train_end_year=2023)
    stored_normals = {("DSCC_Ward_04", 1): 77.5, ("DNCC_Ward_04", 1): 88.25}
    model = _DummyCoreModel(train_end_year=2022, max_normal_year=2021, rain_normals=stored_normals)

    recorded_calls: list[dict[str, Any]] = []

    def spy_builder(
        frame: pd.DataFrame,
        *,
        horizon: int = 1,
        rain_normals: Any = None,
        max_normal_year: int = 2023,
        origin_week: date | None = None,
    ) -> pd.DataFrame:
        recorded_calls.append(
            {
                "horizon": horizon,
                "rain_normals": rain_normals,
                "max_normal_year": max_normal_year,
                "origin_week": origin_week,
            }
        )
        out = frame[["ward_id", "date", "rainfall_mm", "dengue_cases"]].copy()
        out["rainfall_lag_0"] = out["rainfall_mm"]
        out["row_actual"] = out["dengue_cases"].astype(float)
        return out

    hook = scoring_mod.ForecasterHook(
        model_version="dummy-cr5",
        is_baseline_fallback=False,
        climatology=clim,
        core_model=model,
        feature_builder=spy_builder,
    )
    lookup = hook._build_feature_lookup(df, horizon=3)
    assert lookup
    assert len(recorded_calls) == 1
    assert recorded_calls[0]["horizon"] == 3
    assert recorded_calls[0]["rain_normals"] == stored_normals
    assert recorded_calls[0]["max_normal_year"] == 2021


def test_cr_5_real_artifact_lookup_uses_stored_normals_without_refit_warning(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """CR-5: loading the committed LightGBM artifact passes stored normals with zero on-the-fly refit warnings."""
    df = scoring_mod.load_raw_dataset()
    forecaster = scoring_mod.load_forecaster(df, train_end_year=2023)
    assert not forecaster.is_baseline_fallback
    assert forecaster.train_end_year == 2023
    assert forecaster.max_normal_year == 2023
    assert forecaster.rain_normals is not None and len(forecaster.rain_normals) > 0

    with caplog.at_level(logging.WARNING, logger="abhas.features"):
        lookup = forecaster._build_feature_lookup(df, horizon=3)
    assert len(lookup) > 0
    assert not any("rain_normals omitted" in rec.getMessage() for rec in caplog.records)


def test_cr_5_dev_split_refused_for_artifact_trained_after_2018(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """CR-5: --split dev refuses a non-fallback artifact with train_end_year > 2018 and points to ml/backtest.py."""
    df = _mini_dataset(n_weeks=12, start=date(2019, 1, 7))
    clim = scoring_mod.ClimatologyBaseline.fit(df, train_end_year=2018)
    model = _DummyCoreModel(version="abhas-lgbm-2023", train_end_year=2023, max_normal_year=2023)
    hook = scoring_mod.ForecasterHook(
        model_version=model.version,
        is_baseline_fallback=False,
        climatology=clim,
        core_model=model,
        feature_builder=lambda f, **_: f,
    )

    monkeypatch.setattr(run_mod, "load_raw_dataset", lambda: df)
    monkeypatch.setattr(run_mod, "load_forecaster", lambda _df, train_end_year=2023: hook)
    monkeypatch.setattr(run_mod, "RESULTS_DIR", tmp_path / "results")
    monkeypatch.setattr(run_mod, "HISTORY_PATH", tmp_path / "history.jsonl")
    monkeypatch.setattr(run_mod, "REPORT_PATH", tmp_path / "report.md")

    rc = run_mod.main(["--split", "dev"])
    captured = capsys.readouterr()
    assert rc == 2
    assert "ml/backtest.py" in captured.err
    assert "in-sample" in captured.err.lower()
    assert not (tmp_path / "results").exists()


# ---------------------------------------------------------------------------
# CR-6: Single-row E2E p95 latency vs separate batch throughput
# ---------------------------------------------------------------------------


def test_cr_6_p95_times_sampled_single_row_e2e_calls_and_reports_throughput_separately() -> None:
    """CR-6: p95_ward_ms measures 200 sampled single-row (feature build + predict) calls; throughput is separate."""
    # Build >200 target rows in 2024 so batch scoring uses the vectorized path while CR-6 samples 200 single calls.
    df = _mini_dataset(n_weeks=70, start=date(2023, 9, 4))
    clim = scoring_mod.ClimatologyBaseline.fit(df, train_end_year=2023)
    model = _DummyCoreModel(train_end_year=2023, max_normal_year=2023, single_row_delay_s=0.001)

    single_window_builds = 0

    def counting_builder(
        frame: pd.DataFrame,
        *,
        horizon: int = 1,
        rain_normals: Any = None,
        max_normal_year: int = 2023,
        origin_week: date | None = None,
    ) -> pd.DataFrame:
        nonlocal single_window_builds
        if origin_week is not None:
            single_window_builds += 1
        out = frame[["ward_id", "date", "rainfall_mm", "dengue_cases"]].copy()
        out["rainfall_lag_0"] = out["rainfall_mm"]
        out["row_actual"] = out["dengue_cases"].astype(float)
        return out

    hook = scoring_mod.ForecasterHook(
        model_version="dummy-cr6",
        is_baseline_fallback=False,
        climatology=clim,
        core_model=model,
        feature_builder=counting_builder,
    )

    gm = run_mod.evaluate_global_holdout(df, hook, target_years=(2024,), climatology=clim)
    assert gm["latency_sample_n"] == 200
    assert single_window_builds == 200
    assert model.single_row_calls >= 200
    assert "throughput_ms_per_ward" in gm
    assert isinstance(gm["throughput_ms_per_ward"], float)
    # Single-row calls have >= 1 ms injected delay; amortized batch throughput is much smaller.
    assert gm["p95_ward_ms"] >= 0.8
    assert gm["p95_ward_ms"] > gm["throughput_ms_per_ward"]


# ---------------------------------------------------------------------------
# CR-14: eval.json written ONLY when --split heldout
# ---------------------------------------------------------------------------


def test_cr_14_eval_json_written_only_on_heldout_split(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """CR-14: --split dev and --split all never overwrite eval.json; only --split heldout writes it."""
    df = _mini_dataset(n_weeks=12, start=date(2024, 1, 1))
    clim_dev = scoring_mod.ClimatologyBaseline.fit(df, train_end_year=2018)
    clim_held = scoring_mod.ClimatologyBaseline.fit(df, train_end_year=2023)

    # Minimal 2-case synthetic dataset (1 dev, 1 heldout) locked in tmp_cfg.
    cases = [
        {
            "id": "DEV-001",
            "split": "dev",
            "ward_id": "DSCC_Ward_04",
            "city": "Dhaka South",
            "origin_week": "2024-01-01",
            "horizon": 2,
            "target_week": "2024-01-15",
            "actual_cases": 2,
            "actual_tier": "Low",
            "ac_refs": ["AC-5"],
        },
        {
            "id": "HO-001",
            "split": "heldout",
            "ward_id": "DSCC_Ward_04",
            "city": "Dhaka South",
            "origin_week": "2024-01-01",
            "horizon": 2,
            "target_week": "2024-01-15",
            "actual_cases": 2,
            "actual_tier": "Low",
            "ac_refs": ["AC-5"],
        },
    ]
    tmp_ds = tmp_path / "forecast.jsonl"
    tmp_ds.write_text("\n".join(json.dumps(c) for c in cases) + "\n", encoding="utf-8")
    tmp_cfg = tmp_path / "config.json"
    cfg = json.loads(run_mod.CONFIG_PATH.read_text(encoding="utf-8"))
    cfg["heldout_sha256"] = run_mod.compute_heldout_sha256(cases)
    tmp_cfg.write_text(json.dumps(cfg, indent=2), encoding="utf-8")

    results_dir = tmp_path / "results"
    monkeypatch.setattr(run_mod, "CONFIG_PATH", tmp_cfg)
    monkeypatch.setattr(run_mod, "FORECAST_DATASET_PATH", tmp_ds)
    monkeypatch.setattr(run_mod, "RESULTS_DIR", results_dir)
    monkeypatch.setattr(run_mod, "HISTORY_PATH", tmp_path / "history.jsonl")
    monkeypatch.setattr(run_mod, "REPORT_PATH", tmp_path / "report.md")
    monkeypatch.setattr(run_mod, "load_raw_dataset", lambda: df)
    monkeypatch.setattr(
        run_mod,
        "load_forecaster",
        lambda _df, train_end_year=2023: scoring_mod.ForecasterHook(
            model_version=f"climatology-le{train_end_year}",
            is_baseline_fallback=True,
            climatology=clim_dev if train_end_year <= 2018 else clim_held,
        ),
    )

    # 1. --split dev must NOT write eval.json
    assert run_mod.main(["--split", "dev"]) == 0
    assert (results_dir / "latest-dev.json").exists()
    assert not (results_dir / "eval.json").exists()

    # 2. --split all --tag baseline must write latest-all.json & baseline.json, NOT eval.json
    assert run_mod.main(["--split", "all", "--tag", "baseline"]) == 0
    assert (results_dir / "latest-all.json").exists()
    assert (results_dir / "baseline.json").exists()
    assert not (results_dir / "eval.json").exists()

    # 3. --split heldout MUST write eval.json (and latest-heldout.json)
    run_mod.main(["--split", "heldout"])
    assert (results_dir / "latest-heldout.json").exists()
    assert (results_dir / "eval.json").exists()
    eval_payload = json.loads((results_dir / "eval.json").read_text(encoding="utf-8"))
    assert eval_payload["split"] == "heldout"


# ---------------------------------------------------------------------------
# CR-15: Climatology-fallback rows counted as skipped & fail heldout
# ---------------------------------------------------------------------------


def test_cr_15_fallback_rows_counted_as_skipped_and_fail_heldout(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """CR-15: missing feature rows falling back to climatology increment skipped and fail --split heldout."""
    df = _mini_dataset(n_weeks=12, start=date(2024, 1, 1))
    clim = scoring_mod.ClimatologyBaseline.fit(df, train_end_year=2023)
    model = _DummyCoreModel(version="perfect-except-missing", train_end_year=2023, max_normal_year=2023)

    # Omit one specific origin week from the feature builder to trigger climatology fallback.
    missing_origin = date(2024, 1, 29)

    def partial_builder(
        frame: pd.DataFrame,
        *,
        horizon: int = 1,
        rain_normals: Any = None,
        max_normal_year: int = 2023,
        origin_week: date | None = None,
    ) -> pd.DataFrame:
        sub = frame[frame["date"] != missing_origin].copy()
        out = sub[["ward_id", "date", "rainfall_mm", "dengue_cases"]].copy()
        out["rainfall_lag_0"] = out["rainfall_mm"]
        out["row_actual"] = out["dengue_cases"].astype(float)
        return out

    hook = scoring_mod.ForecasterHook(
        model_version=model.version,
        is_baseline_fallback=False,
        climatology=clim,
        core_model=model,
        feature_builder=partial_builder,
        no_weather_meta={"1": 9.0, "2": 9.0, "3": 9.0, "4": 9.0},
    )

    # Direct predict_batch verification
    preds, _ = hook.predict_batch(
        df,
        [
            ("DSCC_Ward_04", date(2024, 1, 8), 2),
            ("DSCC_Ward_04", missing_origin, 2),
        ],
    )
    assert preds[0].used_fallback is False
    assert preds[1].used_fallback is True

    # End-to-end --split heldout run: even if all numeric floors pass, skipped > 0 MUST fail (exit 1).
    cases = [
        {
            "id": "HO-001",
            "split": "heldout",
            "ward_id": "DSCC_Ward_04",
            "city": "Dhaka South",
            "origin_week": missing_origin.isoformat(),
            "horizon": 2,
            "target_week": (missing_origin + timedelta(weeks=2)).isoformat(),
            "actual_cases": 2,
            "actual_tier": "Low",
            "ac_refs": ["AC-5"],
        }
    ]
    tmp_ds = tmp_path / "forecast.jsonl"
    tmp_ds.write_text(json.dumps(cases[0]) + "\n", encoding="utf-8")
    tmp_cfg = tmp_path / "config.json"
    cfg = json.loads(run_mod.CONFIG_PATH.read_text(encoding="utf-8"))
    cfg["heldout_sha256"] = run_mod.compute_heldout_sha256(cases)
    tmp_cfg.write_text(json.dumps(cfg, indent=2), encoding="utf-8")

    results_dir = tmp_path / "results"
    hist_path = tmp_path / "history.jsonl"
    monkeypatch.setattr(run_mod, "CONFIG_PATH", tmp_cfg)
    monkeypatch.setattr(run_mod, "FORECAST_DATASET_PATH", tmp_ds)
    monkeypatch.setattr(run_mod, "RESULTS_DIR", results_dir)
    monkeypatch.setattr(run_mod, "HISTORY_PATH", hist_path)
    monkeypatch.setattr(run_mod, "REPORT_PATH", tmp_path / "report.md")
    monkeypatch.setattr(run_mod, "load_raw_dataset", lambda: df)
    monkeypatch.setattr(run_mod, "load_forecaster", lambda _df, train_end_year=2023: hook)
    # Force floors to pass so only CR-15 skipped > 0 can cause failure.
    monkeypatch.setattr(run_mod, "check_ac5_floors", lambda *_a, **_kw: ({"ok": True}, True))

    rc = run_mod.main(["--split", "heldout"])
    captured = capsys.readouterr()
    assert rc == 1
    assert "skipped" in captured.err.lower()

    out = json.loads((results_dir / "eval.json").read_text(encoding="utf-8"))
    assert out["skipped"] > 0
    assert out["skipped_golden"] == 1
    assert out["skipped_global"] > 0
    assert out["cases"][0]["used_fallback"] is True

    hist_entry = json.loads(hist_path.read_text(encoding="utf-8").strip().splitlines()[-1])
    assert hist_entry["skipped"] == out["skipped"]
