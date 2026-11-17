"""Runner: `python -m app --port 8001` (cross-platform)."""

import argparse

import uvicorn

from app.core.config import get_settings


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the LumaDesk API")
    parser.add_argument("--port", type=int, default=get_settings().api_port)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--no-reload", action="store_true")
    args = parser.parse_args()
    uvicorn.run("app.main:app", host=args.host, port=args.port, reload=not args.no_reload, log_config=None)


if __name__ == "__main__":
    main()
