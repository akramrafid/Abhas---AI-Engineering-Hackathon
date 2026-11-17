"""Write the OpenAPI contract: `python -m app.export_openapi ../../contracts/openapi.json`."""

import json
import sys
from pathlib import Path

from app.main import create_app


def main() -> None:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "openapi.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    spec = create_app().openapi()
    out.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {out} ({len(spec.get('paths', {}))} paths)")


if __name__ == "__main__":
    main()
