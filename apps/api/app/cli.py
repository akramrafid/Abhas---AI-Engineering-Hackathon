"""CLI: `python -m app.cli index` — one command indexes data/kb (idempotent)."""

import asyncio
import json
import sys

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.services.kb import index_kb


def main() -> None:
    configure_logging(get_settings().log_level)
    cmd = sys.argv[1] if len(sys.argv) > 1 else "index"
    if cmd != "index":
        print("usage: python -m app.cli index", file=sys.stderr)
        sys.exit(2)
    result = asyncio.run(index_kb())
    print(json.dumps(result.model_dump(), indent=2))


if __name__ == "__main__":
    main()
