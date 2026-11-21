"""Verify committed model artifact SHA-256 and deserialization (run by scripts/setup.mjs)."""

from __future__ import annotations

import sys

from app.adapters.lgbm_model import ModelArtifactError, load_model, verify_artifact_integrity
from app.core.config import get_settings


def main() -> int:
    settings = get_settings()
    model_path = settings.model_path
    try:
        meta = verify_artifact_integrity(model_path)
        model = load_model(model_path)
    except ModelArtifactError as exc:
        print(f"ERROR: {exc.detail}", file=sys.stderr)
        return 1

    # Smoke-predict a single feature row across h=1..4 to verify boosters execute cleanly.
    sample_row = {name: 0.0 for name in model.feature_names}
    for h in (1, 2, 3, 4):
        res = model.predict([sample_row], horizon=h)
        if len(res) != 1 or not (0.0 <= res[0].p10 <= res[0].expected_cases <= res[0].p90):
            print(f"ERROR: smoke prediction invariant failed at h={h}", file=sys.stderr)
            return 1

    sha = str(meta.get("sha256", ""))[:12]
    print(f"OK: verified {model.version} ({model_path.name}, sha256={sha}..., {len(model.feature_names)} features)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
