"""`npm run healthcheck`: one tiny call per service; prints name, OK/FAIL, latency, never values."""

import asyncio
import sys
import time

from pydantic import BaseModel

from app.adapters.llm import get_llm
from app.core.config import get_settings


class _Pong(BaseModel):
    ok: bool


async def _llm() -> str:
    llm = get_llm()
    if llm.mock:
        return "MOCK (no LLM_API_KEY or LLM_MOCK=1)"
    msgs = [{"role": "user", "content": 'Reply with the JSON object {"ok": true}'}]
    await llm.complete_json(msgs, _Pong, llm.meter(), max_tokens=10)
    return "OK"


def main() -> None:
    s = get_settings()
    failed = False
    t0 = time.perf_counter()
    try:
        status = asyncio.run(_llm())
    except Exception as exc:  # noqa: BLE001
        status, failed = f"FAIL ({type(exc).__name__})", True
    print(f"{'llm':<10} {status:<45} {(time.perf_counter() - t0) * 1000:.0f} ms")
    print(f"{'kb_dir':<10} {'OK' if s.kb_dir.exists() else 'FAIL (missing)'}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
