---
name: testing-qa
description: Test strategy and harness for BUILDER-QA and every builder - pytest with async client and lifespan, dependency overrides and fake LLMs, contract drift and schema tests, error-path tests, LLM eval runner with threshold and report, Playwright golden-path smoke, a dependency-free Node smoke script, optional load smoke, flaky-test policy and how to report failures to LEAD. Use when writing tests, evals, smoke checks, or verifying that a slice works.
---

# Testing and QA

Goal: prove the golden path works, keep `LEAD_BRANCH` green, and catch regressions in minutes. Order of
value in a hackathon: **smoke of golden path → API integration tests → unit tests of core logic → evals →
e2e UI → load**.

## 1. API test harness (`apps/api/tests/conftest.py`)
```
uv add --dev pytest pytest-asyncio respx asgi-lifespan
```
`pyproject.toml`:
```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
markers = ["live: calls real providers (run with RUN_LIVE=1)"]
```
```python
import os
import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient
from app.core.config import get_settings
from app.main import create_app

@pytest.fixture
async def client(monkeypatch):
    monkeypatch.setenv("LLM_MOCK", "1")            # deterministic fake LLM; no keys needed
    get_settings.cache_clear()
    app = create_app()
    async with LifespanManager(app):              # ASGITransport alone does not run lifespan
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c

def pytest_collection_modifyitems(config, items):
    if os.getenv("RUN_LIVE") != "1":
        skip = pytest.mark.skip(reason="live test; set RUN_LIVE=1")
        for item in items:
            if "live" in item.keywords:
                item.add_marker(skip)
```
Swap any service with `app.dependency_overrides[get_x_service] = lambda: FakeX()`; mock outbound HTTP with
`respx`. Integration tests may use the shared local Postgres/Qdrant with a test-specific schema/collection
name and cleanup.

## 2. What every endpoint needs
- Happy path: status + body validates against the response model (`ResponseModel.model_validate(r.json())`).
- Validation error: 422 with problem+json keys `type,title,status,detail,request_id`.
- Dependency failure: fake adapter raises → 502/503/504 problem+json, no stack trace in body.
- AuthZ (if users): user A cannot read user B's object (404/403).
- Contract drift test (catches un-exported schema changes):
```python
import json, pathlib
def test_contract_is_exported():
    from app.main import app
    committed = json.loads(pathlib.Path("../../contracts/openapi.json").read_text(encoding="utf-8"))
    assert app.openapi() == committed, "Schemas changed: LEAD must run `npm run contracts` and commit"
```

## 3. LLM features
- Unit tests use the fake LLM (fixtures in `tests/fixtures/llm/`); assert on parsing, validation, fallbacks,
  refusal paths, and that prompts include required sections (not exact wording).
- Live checks are `@pytest.mark.live` and skipped by default.
- Evals (`apps/api/evals/run.py`, `npm run eval`) — format and metrics from `llm-engineering` §7:
```python
import asyncio, json, os, pathlib, statistics, time

CASES = pathlib.Path(__file__).parent / "golden.jsonl"
THRESHOLD = float(os.getenv("EVAL_THRESHOLD", "0.8"))

async def run_case(case: dict) -> dict:
    t0 = time.perf_counter()
    output = await call_system(case["input"])                    # call the service (or HTTP API) under test
    passed, why = score(case, output)                            # deterministic checks first, then judge
    return {"id": case["id"], "pass": passed, "why": why, "ms": (time.perf_counter() - t0) * 1000}

async def main() -> int:
    cases = [json.loads(l) for l in CASES.read_text(encoding="utf-8").splitlines() if l.strip()]
    results = await asyncio.gather(*(run_case(c) for c in cases))
    rate = sum(r["pass"] for r in results) / len(results)
    lat = sorted(r["ms"] for r in results)
    report = [f"# Eval report\n\npass rate {rate:.0%} (threshold {THRESHOLD:.0%}) · p50 {statistics.median(lat):.0f} ms · "
              f"p95 {lat[int(0.95 * (len(lat) - 1))]:.0f} ms\n", "| id | pass | why | ms |", "|---|---|---|---|"]
    report += [f"| {r['id']} | {'✅' if r['pass'] else '❌'} | {r['why']} | {r['ms']:.0f} |" for r in results]
    (pathlib.Path(__file__).parent / "report.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    return 0 if rate >= THRESHOLD else 1

if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
```

## 4. Golden-path smoke (`scripts/smoke.mjs`, `npm run smoke`) — no dependencies, runs anywhere
```js
#!/usr/bin/env node
const API = process.env.SMOKE_API_URL ?? "http://localhost:8000";
const t = () => AbortSignal.timeout(Number(process.env.SMOKE_TIMEOUT_MS ?? 30000));
const get = (p) => fetch(API + p, { signal: t() });
const post = (p, body) => fetch(API + p, { method: "POST", signal: t(),
  headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const ok = async (r) => { if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r; };

const steps = [
  ["healthz", async () => ok(await get("/healthz"))],
  ["readyz", async () => ok(await get("/readyz"))],
  // QA adds one step per golden-path action from PLAN.md §2, e.g.:
  // ["ask", async () => { const j = await (await ok(await post("/api/v1/chat", { message: "..." }))).json();
  //                       if (!j.answer) throw new Error("empty answer"); }],
];

let failed = 0;
for (const [name, fn] of steps) {
  const t0 = Date.now();
  try { await fn(); console.log(`PASS ${name} (${Date.now() - t0} ms)`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
process.exit(failed ? 1 : 0);
```

## 5. UI end-to-end (Playwright, `apps/web/e2e/`)
```
cd apps/web && npm i -D @playwright/test && npx playwright install chromium
```
```ts
import { test, expect } from "@playwright/test";
test("golden path", async ({ page }) => {
  await page.goto(process.env.E2E_BASE_URL ?? "http://localhost:3001");
  await page.getByTestId("chat-input").fill("<a question from the seed corpus>");
  await page.getByTestId("send-button").click();
  await expect(page.getByTestId("answer")).not.toBeEmpty({ timeout: 30_000 });
  await expect(page.getByTestId("citation-1")).toBeVisible();
});
```
Use test IDs only (UI adds them). One retry in CI; never `waitForTimeout`.

## 6. Optional load smoke
Non-LLM endpoints: `npx autocannon -c 20 -d 20 http://localhost:8000/api/v1/<endpoint>` → record p95.
LLM endpoints only with `LLM_MOCK=1` (don't burn credits).

## 7. Policies
- A failing test on `LEAD_BRANCH` is a BLOCKER. Report to LEAD: test name, `file:line`, error, likely owner.
- No sleeps; wait on conditions. No network in unit tests. No real secrets in fixtures.
- Tests must pass from a clean worktree: `npm run test` after `--setup run`.

## 8. Done checklist
Harness + fake LLM in place · every endpoint: happy + validation + dependency-failure tests · contract drift
test · smoke covers every golden-path step · Playwright golden path green · evals report committed with pass
rate ≥ threshold · CI runs lint + tests.
