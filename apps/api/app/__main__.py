"""Runner: python -m app [--env dev|test|production] [--port N] [--host H] [--no-reload]."""

import argparse
import os


def main() -> None:
    p = argparse.ArgumentParser(prog="python -m app")
    p.add_argument("--port", type=int, default=int(os.getenv("API_PORT", "8000")))
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--env", choices=["dev", "test", "production"], default=None)
    p.add_argument("--no-reload", action="store_true")
    a = p.parse_args()
    if a.env:
        os.environ["APP_ENV"] = a.env  # set before the app (and its settings) are imported
    import uvicorn

    uvicorn.run("app.main:app", host=a.host, port=a.port, reload=not a.no_reload)


if __name__ == "__main__":
    main()
