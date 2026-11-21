"""python -m app.export_openapi <path> — writes the OpenAPI contract (committed as contracts/openapi.json)."""

import json
import sys
from pathlib import Path

from app.main import create_app


def main() -> None:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "../../contracts/openapi.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    spec = create_app().openapi()
    out.write_text(json.dumps(spec, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    sys.stdout.write(f"wrote {out} ({len(spec.get('paths', {}))} paths)\n")


if __name__ == "__main__":
    main()
