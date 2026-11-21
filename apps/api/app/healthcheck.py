"""python -m app.healthcheck — checks local prerequisites; prints names and OK/FAIL only, never values."""

import sys

from app.core.config import get_settings


def main() -> int:
    s = get_settings()
    checks = {
        "dataset xlsx": s.raw_dataset_path.exists(),
        "model artifact": s.model_path.exists(),
        "anthropic key (optional)": s.llm_enabled,
    }
    for name, ok in checks.items():
        sys.stdout.write(f"{name:28} {'OK' if ok else 'MISSING'}\n")
    return 0 if checks["dataset xlsx"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
