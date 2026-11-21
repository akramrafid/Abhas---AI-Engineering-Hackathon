"""Probe NVIDIA GPU availability and verify LightGBM GPU (OpenCL) & XGBoost CUDA learners.

Usage:
    node scripts/py.mjs -m ml.gpu_probe
    node scripts/py.mjs -m ml.gpu_probe --json
"""

from __future__ import annotations

import argparse
import json
import subprocess
import time
from dataclasses import asdict, dataclass
from typing import Any

import lightgbm as lgb
import numpy as np


@dataclass(frozen=True)
class EngineProbeResult:
    usable: bool
    elapsed_ms: float | None = None
    detail: str = ""
    monotone_supported: bool | None = None


@dataclass(frozen=True)
class GPUProbeReport:
    nvidia_smi_ok: bool
    gpu_name: str | None
    memory_total_mib: str | None
    driver_version: str | None
    lightgbm_gpu: EngineProbeResult
    xgboost_cuda: EngineProbeResult


def query_nvidia_smi() -> tuple[bool, str | None, str | None, str | None]:
    """Query GPU name, total VRAM, and driver version via nvidia-smi."""
    try:
        proc = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.total,driver_version",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return False, None, None, None

    if proc.returncode != 0 or not proc.stdout.strip():
        return False, None, None, None

    first_line = proc.stdout.strip().splitlines()[0]
    parts = [p.strip() for p in first_line.split(",")]
    if len(parts) < 3:
        return True, parts[0] if parts else None, None, None
    return True, parts[0], f"{parts[1]} MiB", parts[2]


def _synthetic_poisson_data(n_rows: int = 1000, n_features: int = 27) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(42)
    X = rng.normal(0.0, 1.0, size=(n_rows, n_features)).astype(np.float32)
    rate = np.exp(np.clip(0.3 * X[:, 0] + 0.2 * X[:, 1] - 0.1 * X[:, 2], -2.0, 3.0))
    y = rng.poisson(rate).astype(np.float64)
    return X, y


def probe_lightgbm_gpu(n_rows: int = 1000) -> EngineProbeResult:
    """Try a 1,000-row Poisson LightGBM fit with device_type='gpu' (OpenCL)."""
    X, y = _synthetic_poisson_data(n_rows=n_rows)
    t0 = time.perf_counter()
    try:
        model = lgb.LGBMRegressor(
            objective="poisson",
            n_estimators=20,
            learning_rate=0.1,
            num_leaves=31,
            max_bin=63,
            device_type="gpu",
            gpu_use_dp=False,
            random_state=42,
            n_jobs=1,
            verbose=-1,
        )
        model.fit(X, y)
        preds = np.asarray(model.predict(X[:10]), dtype=np.float64)
        if not np.all(np.isfinite(preds)):
            return EngineProbeResult(usable=False, detail="non-finite predictions from LightGBM GPU")
        elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
    except Exception as exc:  # noqa: BLE001
        return EngineProbeResult(usable=False, detail=f"{type(exc).__name__}: {exc}")

    # Also test monotone constraints on GPU so train.py knows whether CPU fallback is required.
    monotone_ok = True
    monotone_note = "monotone_constraints supported on GPU"
    try:
        mc = [1, 1, 1] + [0] * (X.shape[1] - 3)
        mc_model = lgb.LGBMRegressor(
            objective="poisson",
            n_estimators=10,
            learning_rate=0.1,
            num_leaves=31,
            max_bin=63,
            device_type="gpu",
            gpu_use_dp=False,
            monotone_constraints=mc,
            random_state=42,
            n_jobs=1,
            verbose=-1,
        )
        mc_model.fit(X, y)
    except Exception as exc:  # noqa: BLE001
        monotone_ok = False
        monotone_note = f"monotone_constraints unsupported on GPU ({type(exc).__name__}: {exc})"

    return EngineProbeResult(
        usable=True,
        elapsed_ms=elapsed_ms,
        detail=f"LightGBM {lgb.__version__} OpenCL GPU fit OK; {monotone_note}",
        monotone_supported=monotone_ok,
    )


def probe_xgboost_cuda(n_rows: int = 1000) -> EngineProbeResult:
    """Try a 1,000-row Poisson XGBoost fit with device='cuda'."""
    try:
        import xgboost as xgb  # type: ignore[import-not-found]
    except ImportError as exc:
        return EngineProbeResult(
            usable=False,
            detail=f"xgboost not installed ({exc}); install with `uv sync --group train`",
        )

    X, y = _synthetic_poisson_data(n_rows=n_rows)
    t0 = time.perf_counter()
    try:
        model = xgb.XGBRegressor(
            objective="count:poisson",
            tree_method="hist",
            device="cuda",
            n_estimators=20,
            learning_rate=0.1,
            max_depth=5,
            max_bin=256,
            random_state=42,
            n_jobs=1,
            verbosity=0,
        )
        model.fit(X, y)
        preds = np.asarray(model.predict(X[:10]), dtype=np.float64)
        if not np.all(np.isfinite(preds)):
            return EngineProbeResult(usable=False, detail="non-finite predictions from XGBoost CUDA")
        elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
    except Exception as exc:  # noqa: BLE001
        return EngineProbeResult(usable=False, detail=f"{type(exc).__name__}: {exc}")

    monotone_ok = True
    monotone_note = "monotone_constraints supported on CUDA"
    try:
        mc = tuple([1, 1, 1] + [0] * (X.shape[1] - 3))
        mc_model = xgb.XGBRegressor(
            objective="count:poisson",
            tree_method="hist",
            device="cuda",
            n_estimators=10,
            learning_rate=0.1,
            max_depth=5,
            monotone_constraints=mc,
            random_state=42,
            n_jobs=1,
            verbosity=0,
        )
        mc_model.fit(X, y)
    except Exception as exc:  # noqa: BLE001
        monotone_ok = False
        monotone_note = f"monotone_constraints unsupported on CUDA ({type(exc).__name__}: {exc})"

    return EngineProbeResult(
        usable=True,
        elapsed_ms=elapsed_ms,
        detail=f"XGBoost {xgb.__version__} CUDA hist fit OK; {monotone_note}",
        monotone_supported=monotone_ok,
    )


def run_probe() -> GPUProbeReport:
    smi_ok, name, mem, driver = query_nvidia_smi()
    lgbm_res = probe_lightgbm_gpu()
    xgb_res = probe_xgboost_cuda()
    return GPUProbeReport(
        nvidia_smi_ok=smi_ok,
        gpu_name=name,
        memory_total_mib=mem,
        driver_version=driver,
        lightgbm_gpu=lgbm_res,
        xgboost_cuda=xgb_res,
    )


def format_report(report: GPUProbeReport) -> str:
    lines = ["=== Abhas GPU Training Probe ==="]
    if report.nvidia_smi_ok:
        lines.append(
            f"GPU: {report.gpu_name} | Memory: {report.memory_total_mib} | Driver: {report.driver_version}"
        )
    else:
        lines.append("GPU: nvidia-smi unavailable or no NVIDIA GPU detected")
    lines.append(
        f"LightGBM GPU (OpenCL): {'USABLE' if report.lightgbm_gpu.usable else 'UNAVAILABLE'}"
        + (f" ({report.lightgbm_gpu.elapsed_ms} ms)" if report.lightgbm_gpu.elapsed_ms is not None else "")
        + f" — {report.lightgbm_gpu.detail}"
    )
    lines.append(
        f"XGBoost CUDA:          {'USABLE' if report.xgboost_cuda.usable else 'UNAVAILABLE'}"
        + (f" ({report.xgboost_cuda.elapsed_ms} ms)" if report.xgboost_cuda.elapsed_ms is not None else "")
        + f" — {report.xgboost_cuda.detail}"
    )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Probe GPU availability for LightGBM and XGBoost training.")
    ap.add_argument("--json", action="store_true", help="Emit machine-readable JSON output.")
    args = ap.parse_args(argv)
    report = run_probe()
    if args.json:
        payload: dict[str, Any] = asdict(report)
        print(json.dumps(payload, indent=2))
    else:
        print(format_report(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
