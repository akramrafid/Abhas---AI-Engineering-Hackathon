# Security review r1 (LEAD code) — 2026-11-21 21:02 BST — reviewer: antigravity/Gemini 4 Neon (XHigh)

- **Scope (read-only)**: `apps/api/app/core/**` · `apps/api/app/ports/**` · `apps/api/app/main.py` · `apps/api/app/export_openapi.py` · `apps/api/app/features/*/schemas.py` · `apps/api/app/features/ops/router.py` · `scripts/setup.mjs` · `scripts/py.mjs` · `scripts/smoke.mjs` · `package.json` · `apps/api/pyproject.toml` · `apps/api/requirements.txt` · `.env.example`
- **Commit reviewed**: `lead` @ `9bcd4b9` (differential review across `4d27783`, `0b1687b`, `e640538`, `ff89e58`)
- **Authors reviewed**: LEAD `claude/opus-5.5` (`4d27783`, `0b1687b` skeleton & contracts) · LEAD-fallback `antigravity/Gemini 4 Neon` (`e640538`, `ff89e58` hardening pass on `core/*`, `ops/router.py`, `main.py`, `setup.mjs`)
- **Verdict**: **FIX-BLOCKERS** (0 BLOCKER · 4 HIGH · 5 MEDIUM · 3 LOW — HIGH findings require remediation before ship)
- **Automated checks**:
  - Secrets scan (`git ls-files .env`, `git grep`, `git log -p e193430..HEAD`): ✅ clean (`.env` untracked/gitignored; 0 secrets in tracked files or commit history; `gitleaks`: n.a. — not installed)
  - Python deps (`uvx pip-audit -r apps/api/requirements.txt` & full `uv.lock` export): ✅ 0 known vulnerabilities (`requirements.txt` package pins match `uv.lock` 100%)
  - JS deps (`npm --prefix apps/web audit --omit=dev` & root `npm audit`): ✅ 0 vulnerabilities (0 packages with `hasInstallScript` across 26 root + 504 web lockfile entries)
  - Python SAST (`uvx bandit` on all scoped Python files, 781 LOC): ✅ 0 issues (`semgrep`: n.a. — not installed)
  - Supply-chain metadata sweep (`supply-chain-risk-auditor/scripts/collect.py`): **not completed** (timed out after >11 min during registry/GitHub API sweep on `apps/api`; stopped per coordinator guidance)
  - Baseline CI/test evidence: `uv run ruff check` (scoped files) ✅ · `uv run pyright` (0 errors) ✅ · `uv run pytest -q` (27 passed) ✅ · `node .orca-team/tools/envtool.mjs check` ✅ · local read-only ASGI/FastAPI security probes ✅
- **Red team (`npm run redteam`)**: n.a. (out of scope for this round — threat-model part only; `evals/redteam.py` runs in full red-team pass once `core-forecast` lands) · SSRF (config-level): ⚠️ see SEC-10 · tenant isolation: n.a. (single-office tool, no user accounts per ADR-0008)
- **Counts**: BLOCKER 0 · HIGH 4 · MEDIUM 5 · LOW 3

---

## 1. Threat model (LEAD trust-boundary & contract surface)

### Assets
- **Operator credentials & budget**: `ANTHROPIC_API_KEY` (LLM spend budget capped at `$1/day`), `OPS_TOKEN`, future Stage-2 `DATABASE_URL` credentials (Postgres DSN).
- **Local workstation integrity**: Developer/judge machine executing `npm run setup` (`scripts/setup.mjs`), `npm run dev` (`scripts/py.mjs`), and deserializing `MODEL_PATH` (`joblib`/`pickle` artifact).
- **API availability & accuracy**: Single-process FastAPI + LightGBM uvicorn worker, SQLite WAL database (`data/abhas.db`), prediction & weather caches, and numeric integrity of dengue risk advisories.
- **Operational telemetry**: `/api/v1/ops` (request volumes, model version, cache hit rate, daily LLM spend/budget).

### Actors
1. **Local ward officer / epidemiologist** (benign browser user on `http://localhost:3000`).
2. **Untrusted local or LAN/remote HTTP client** (if `--host 0.0.0.0`, container, or Vercel `[tool.vercel]` is exposed; or malicious webpage visited in the officer's browser attempting cross-origin requests to `localhost:8000`).
3. **Compromised upstream package / tampered artifact** (PyPI sdist build script, unverified pip download without hashes, tampered `.joblib` pickle file).
4. **Upstream provider anomaly / malicious response** (compromised or misconfigured `OPEN_METEO_BASE_URL` or Anthropic API error/hallucinated output).

### Trust boundaries
```mermaid
flowchart LR
  subgraph B1["Boundary 1: Browser / Untrusted Client"]
    user["Browser / HTTP Client"]
  end
  subgraph B2["Boundary 2: Local Workstation CLI"]
    cli["scripts/setup.mjs & scripts/py.mjs"]
  end
  subgraph B3["Boundary 3: FastAPI API (LEAD core + contracts)"]
    mw["CORS -> RequestId -> RateLimit -> BodySizeLimit"]
    schemas["Pydantic Schemas & Types (WardId, IsoWeek, WeatherOverride)"]
    ops["/api/v1/ops (X-Ops-Token guard)"]
    ports["Ports: ForecastModel / WeatherSource / LLM / Repos"]
  end
  subgraph B4["Boundary 4: External & Local State"]
    db[("SQLite / Postgres DB")]
    artifact[["joblib model artifact (pickle)"]]
    om["Open-Meteo API"]
    llm["Anthropic API (optional)"]
  end

  user -->|"HTTP JSON / Headers"| mw
  mw --> schemas --> ports
  mw --> ops
  cli -->|"child_process spawn"| B4
  ports --> db
  ports --> artifact
  ports -->|"HTTPS (OPEN_METEO_BASE_URL)"| om
  ports -.->|"HTTPS (ANTHROPIC_API_KEY)"| llm
```

### STRIDE summary across LEAD boundaries
- **Spoofing**: `/api/v1/ops` fails open to remote IPs when `OPS_TOKEN` is unset (SEC-2); client-supplied `X-Request-ID` is echoed unvalidated (SEC-4).
- **Tampering**: `scripts/setup.mjs` passes unquoted paths to `cmd.exe` (SEC-1); pip fallback lacks `--require-hashes` and `--only-binary=:all:` (SEC-9); `joblib.load` deserializes pickle payloads (mitigated by mandatory SHA-256 verification before load).
- **Repudiation**: `RequestIdMiddleware` resets `request_id_var` before logging, erasing correlation IDs from 100% of HTTP access logs and 500 logs (SEC-4, SEC-7).
- **Information Disclosure**: Unredacted exception tracebacks in `JsonFormatter` can leak secrets/DSNs to logs (SEC-4); `/docs` and `/openapi.json` stay open in production and `/api/v1/ops` lacks `Cache-Control: no-store` (SEC-11).
- **Denial of Service**: Chunked POSTs bypass 64 KB cap in RAM before rejection (SEC-3); `origin_week=9999-12-27` triggers unhandled 500 `OverflowError` (SEC-5); non-ASCII `X-Ops-Token` triggers unhandled 500 `TypeError` (SEC-6); reverse-proxy deployments collapse all clients into one rate-limit bucket (SEC-8).
- **Elevation of Privilege**: Local command execution via Windows `cmd.exe` metacharacters in clone path during `npm run setup` (SEC-1); `APP_ENV=prod` bypasses `!= "production"` guards (SEC-10).

### OWASP Top 10 for LLM Applications 2026 (contract & core threat model)
| ID | Risk | Applies? | Control in LEAD core / contracts | Gap / Finding |
|---|---|---|---|---|
| LLM01 | Prompt Injection | partial | `AdvisoryRequest` accepts only strict structured identifiers (`WardId`, `IsoWeek`, `Horizon`, `Literal["en","bn"]`) — zero free-text user prompt input reaches `ports/llm.py`. | Indirect risk only if future adapters inject unsanitized external strings into prompts. |
| LLM02 | Sensitive Information Disclosure | yes | `ANTHROPIC_API_KEY` and `OPS_TOKEN` use Pydantic `SecretStr`; HTTP 500 returns generic `problem+json`. | `JsonFormatter` performs zero log redaction on messages/exceptions (SEC-4). |
| LLM03 | Excessive Agency | no | `ports/llm.py` exposes single-shot `complete_json` only; zero tools or side-effect calls. | Keep tool calling disabled on advisory port. |
| LLM04 | Supply Chain | yes | `uv.lock` & `package-lock.json` committed; `pip-audit` and `npm audit --omit=dev` report 0 CVEs; `setup.mjs` runs `ml.verify_artifact`. | Pip fallback removed `--only-binary=:all:` and `requirements.txt` uses `--no-hashes` (SEC-9); `ml/**` skips ruff `S` rules (SEC-12). |
| LLM05 | Data and Model Poisoning | partial | Raw dataset read-only; no user-facing upload or ingestion routes; model artifact verified via SHA-256 at setup/startup. | `joblib` uses pickle (`CWE-502`) — startup loader (CORE) must verify SHA-256 before `joblib.load()`. |
| LLM06 | Unbounded Consumption | yes | `llm_max_output_tokens` capped `[1, 1000]` (default 400); `llm_daily_budget_usd` default `$1`; `advisory_per_minute=20` when LLM enabled; `CallLog.today()` port contract. | Chunked request bodies buffer unbounded RAM before 413 (SEC-3); proxy IP collapse & FIFO bucket eviction weaken rate limiting (SEC-8). |
| LLM07 | Misinformation | yes | `AdvisoryResponse` contract requires `numbers_validated: bool` and bounded output lengths (`headline <= 160`, `summary <= 800`, `actions <= 5`). | Runtime numeric grounding enforced by CORE adapter (out of scope here). |
| LLM08 | Hidden Context Exposure | low | Structured JSON output schema only (`AdvisoryResponse`); no system prompt returned via schema. | Verified in full red-team pass once CORE LLM adapter lands. |
| LLM09 | Vector and Embedding Weaknesses | no | Out of scope — no RAG or vector database (ADR-0006). | — |
| LLM10 | Improper Output Handling | partial | `AdvisoryResponse` enforces strict field types and max lengths; FastAPI returns JSON (`application/json`). | API responses omit `X-Content-Type-Options: nosniff` (SEC-11); UI rendering audited separately. |

### OWASP Top 10:2025 (web/API surface)
| ID | Category | Posture in LEAD code | Findings |
|---|---|---|---|
| A01:2025 | Broken Access Control | `/api/v1/ops` fails open to remote IPs when `OPS_TOKEN` is unset; CORS defaults safe (`allow_credentials=False`). | SEC-2, SEC-10 |
| A02:2025 | Security Misconfiguration | `APP_ENV=prod` bypasses `"production"` guards; missing API security headers; `/docs` exposed in prod; `CORS_ORIGINS=*` accepted. | SEC-10, SEC-11 |
| A03:2025 | Software Supply Chain Failures | 0 known CVEs (`pip-audit`, `npm audit`), 0 npm install scripts; pip fallback lacks hashes and `--only-binary=:all:`. | SEC-9 |
| A04:2025 | Cryptographic Failures | `hmac.compare_digest` used for ops token (timing-safe), but fails on non-ASCII `str`; `SecretStr` used for keys. | SEC-6 |
| A05:2025 | Injection | `scripts/setup.mjs` uses `shell: true` on Windows (`cmd.exe` injection); `scripts/py.mjs` safe (`shell: false`); `WardId` regex strict. | SEC-1, SEC-4 |
| A06:2025 | Insecure Design | Per-IP rate limit lacks `TRUSTED_PROXIES` and uses `startswith` exemptions; chunked body cap buffers full body first. | SEC-3, SEC-8 |
| A07:2025 | Authentication Failures | `OPS_TOKEN` empty by default in `.env.example` without localhost restriction; whitespace-only token accepted. | SEC-2, SEC-6 |
| A08:2025 | Software or Data Integrity Failures | `requirements.txt` lacks `--hash`; `package.json` uses `npm install` instead of `npm ci`; `ml/**` exempt from ruff `S` rules. | SEC-9, SEC-12 |
| A09:2025 | Security Logging & Alerting Failures | `JsonFormatter` lacks secret redaction; `request_id` reset before access/500 logging; unsanitized `X-Request-ID`. | SEC-4, SEC-7 |
| A10:2025 | Mishandling of Exceptional Conditions | `origin_week=9999-12-27` causes unhandled 500 `OverflowError`; non-ASCII `X-Ops-Token` causes 500 `TypeError`; 404/405 skip `problem+json`; 500 skips CORS/`request_id`. | SEC-5, SEC-6, SEC-7 |

---

## 2. Findings

### SEC-1 [HIGH] Windows `shell: true` in `scripts/setup.mjs` enables command/argument injection — CWE-78 · OWASP A05:2025
- **File**: `scripts/setup.mjs:18,30,43,51,57,59,65,73-75` · **Owner**: LEAD (delegated: `fix-r1-lead`)
- **Differential context**: `0b1687b` introduced `shell: isWin`; `ff89e58` duplicated it into `runAsync()` and widened `has()`.
- **Why / Evidence**: Every `spawn` / `spawnSync` call passes `shell: isWin` (`true` on Windows). Node.js concatenates `cmd` and `args` **unquoted** before invoking `cmd.exe /d /s /c` (emitting Node `DEP0190`). Line 59 passes the absolute repository path `venvPy = path.join(api, ".venv", "Scripts", "python.exe")` through `cmd.exe`:
  1. Any clone path containing spaces breaks setup (CR-1).
  2. Any clone path containing Windows shell metacharacters (`&`, `|`, `^`, `>`, `<`, `%VAR%` — e.g., `C:\Users\Alice & Bob\abhas`) causes `cmd.exe` to interpret and execute trailing path segments as OS commands.
  3. CR-1's partial fix (`shell: isWin && !path.isAbsolute(cmd)`) still leaves `shell: true` active for `uv`, `py`, `python`, `node`, and `npm`, even though `.exe` binaries (`node`, `uv`, `py`, `python`) do not need a shell on Windows.
- **Concrete fix**: Remove `shell: true` across all helpers. Use `process.execPath` for `node` scripts, invoke `npm` via `process.execPath` + `process.env.npm_execpath` (always present under `npm run setup`, bypassing `npm.cmd` and `cmd.exe` completely), and only fall back to `ComSpec` for `npm.cmd` with fixed hardcoded arguments if invoked outside `npm`:
```js
function spawnNoShell(cmd, args, cwd) {
  return spawn(cmd, args, { cwd, stdio: "inherit", shell: false });
}
function runNpmCi(cwd) {
  if (process.env.npm_execpath) {
    return runAsync(process.execPath, [process.env.npm_execpath, "ci", "--no-audit", "--no-fund"], cwd, "Web deps (npm ci)");
  }
  const cmd = isWin ? (process.env.ComSpec || "cmd.exe") : "npm";
  const args = isWin ? ["/d", "/s", "/c", "npm.cmd", "ci", "--no-audit", "--no-fund"] : ["ci", "--no-audit", "--no-fund"];
  return runAsync(cmd, args, cwd, "Web deps (npm ci)");
}
// Lines 73-75: use process.execPath instead of "node" with shell: false
```

### SEC-2 [HIGH] `/api/v1/ops` fails open to remote IPs and in production when `OPS_TOKEN` is unset — CWE-862 · CWE-287 · OWASP A01:2025 / API2:2023
- **File**: `apps/api/app/features/ops/router.py:21-27` (and `.env.example:29`) · **Owner**: LEAD (and CORE when replacing stub router)
- **Evidence**: Local ASGI probe with `OPS_TOKEN=""` (the exact value `.env.example:29` ships and `setup.mjs:47` copies to `.env`), `APP_ENV="production"`, and remote peer IP `203.0.113.42`:
  `GET /api/v1/ops` → **`HTTP 200`** (`{"model_version":"stub-0","model_loads":1,...}`).
- **Why / Impact**: The module docstring (`router.py:3`), ADR-0008, and PRD AC-10 explicitly promise `/api/v1/ops` is *"open on localhost when OPS_TOKEN is unset"*. `require_ops_token()` never inspects `request.client.host` or `settings.app_env`. Any `--host 0.0.0.0`, container, LAN, or Stage-2/Vercel deployment that keeps `.env.example`'s empty `OPS_TOKEN=` exposes operational telemetry (model version, request volume, daily LLM spend, error rates) unauthenticated to the network.
- **Concrete fix**: Enforce loopback-only open access strictly outside production, and fail closed otherwise (including when `X-Forwarded-For` indicates a proxied remote caller):
```python
LOCALHOST_IPS = frozenset({"127.0.0.1", "::1"})

def require_ops_token(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    x_ops_token: Annotated[str | None, Header()] = None,
) -> None:
    expected = (settings.ops_token.get_secret_value() if settings.ops_token else "").strip()
    if not expected:
        peer = request.client.host if request.client else ""
        proxied = bool(request.headers.get("x-forwarded-for"))
        if settings.app_env != "production" and peer in LOCALHOST_IPS and not proxied:
            return
        raise AppError(401, "unauthorized", "Missing or wrong X-Ops-Token")
    if not hmac.compare_digest((x_ops_token or "").encode("utf-8"), expected.encode("utf-8")):
        raise AppError(401, "unauthorized", "Missing or wrong X-Ops-Token")
```

### SEC-3 [HIGH] `BodySizeLimitMiddleware` buffers unbounded chunked bodies into RAM before returning 413 — CWE-770 · CWE-400 · OWASP API4:2023 / LLM06:2026
- **File**: `apps/api/app/core/ratelimit.py:19-45`, `apps/api/app/main.py:35-42` · **Owner**: LEAD (delegated: `fix-r1-lead`)
- **Differential context**: Added in `ff89e58` to implement the 64 KB cap from `docs/system-design.md:241`.
- **Evidence**: Inspected `FastAPI.__init__`: `max_body_size` defaults to `None` (unlimited). Executed a live ASGI probe sending a chunked 2 MB `POST /api/v1/forecast` (32 × 64 KB chunks, no `Content-Length` header):
  `Chunked 2MB POST: status=413 chunks_read=32/32 (total_buffered=2048KB)`.
- **Why / Impact**: When `Content-Length` is omitted (`Transfer-Encoding: chunked`) or spoofed below 64 KB, line 30 executes `await request.body()`, reading the entire unbounded stream into memory before checking `len(body) > 65_536`. A single client streaming a multi-hundred-MB chunked POST can OOM the single uvicorn worker process before 413 is ever sent.
- **Concrete fix**: Replace the `BaseHTTPMiddleware` implementation with a pure ASGI streaming middleware that wraps `receive()` and immediately aborts with `413 application/problem+json` as soon as cumulative bytes exceed `max_bytes` (without reading another chunk):
```python
class BodySizeLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int = MAX_BODY_BYTES) -> None:
        self.app, self.max_bytes = app, max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = Headers(scope=scope)
        cl = headers.get("content-length")
        if cl and cl.isdigit() and int(cl) > self.max_bytes:
            await self._reject(scope, receive, send)
            return
        seen = 0
        async def limited_receive() -> Message:
            nonlocal seen
            msg = await receive()
            if msg["type"] == "http.request":
                seen += len(msg.get("body", b""))
                if seen > self.max_bytes:
                    raise _BodyTooLarge()
            return msg
        try:
            await self.app(scope, limited_receive, send)
        except _BodyTooLarge:
            await self._reject(scope, receive, send)
```

### SEC-4 [HIGH] No secret redaction in `JsonFormatter` + broken `request_id` correlation & unsanitized `X-Request-ID` — CWE-532 · CWE-778 · CWE-117 · OWASP A09:2025 / LLM02:2026
- **File**: `apps/api/app/core/logging.py:16-30,42-60` · **Owner**: LEAD (delegated: `fix-r1-lead`)
- **Differential context**: Git history shows `d79db59` previously fixed `SEC-3` log redaction during the practice run; the Abhas rewrite (`0b1687b`) omitted the redaction filter entirely.
- **Evidence**:
  1. **Secret leakage in logs (`CWE-532`)**: Probed an unhandled `RuntimeError` carrying a simulated key and password (`password=hunter2 sk-ant-api03-12345678901234567890`). `JsonFormatter.format()` serialized both strings verbatim in the `"exc"` field of stdout JSON. Any `anthropic`, `httpx`, or Stage-2 `sqlalchemy` Postgres DSN exception will leak secrets into log output.
  2. **Broken audit trail (`CWE-778`)**: `RequestIdMiddleware:47-59` calls `request_id_var.reset(token)` in `finally` **before** calling `logging.getLogger("abhas.http").info(...)`. Every single HTTP access log line observed in probes recorded `"request_id": "-"`.
  3. **Header/log control-char injection (`CWE-117`)**: Line 44-45 accepts arbitrary client `X-Request-ID` values (`rid[:64]`) and echoes them verbatim into `response.headers["X-Request-ID"]` and JSON logs; probed with ANSI escape sequence `'bad\x1b[31mANSI'` → echoed back with HTTP 200.
- **Concrete fix**: Redact common secret patterns in `JsonFormatter` (both `msg` and `exc`), validate `X-Request-ID` against `^[A-Za-z0-9._-]{1,64}$`, and log inside `try` before resetting `request_id_var`:
```python
_SECRET_RE = re.compile(
    r"(sk-ant-[A-Za-z0-9_-]{12,}|sk-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{35}|"
    r"ghp_[A-Za-z0-9]{36}|xox[abprs]-[A-Za-z0-9-]+|"
    r"(?i)(?:bearer\s+|x-ops-token['\":=\s]+|password=)[^\s'\",;]+|"
    r"(?i)(postgres(?:ql)?://[^:/\s]+:)[^@\s]+(@))"
)
_SAFE_RID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")

def _redact(text: str) -> str:
    return _SECRET_RE.sub(lambda m: f"{m.group(2)}[REDACTED]{m.group(3)}" if m.group(2) else "[REDACTED]", text)
```
In `RequestIdMiddleware.dispatch`: move `logging.getLogger("abhas.http").info(...)` inside the `try:` block before `finally: request_id_var.reset(token)`, and replace `rid = request.headers.get("x-request-id") or ...` with `raw = request.headers.get("x-request-id", ""); rid = raw if _SAFE_RID.match(raw) else uuid.uuid4().hex[:16]`.

### SEC-5 [MEDIUM] Unbounded `IsoWeek` (`origin_week`) triggers unhandled `OverflowError` (500) in dataset & live modes — CWE-1284 · CWE-755 · OWASP API8:2023 / A10:2025
- **File**: `apps/api/app/core/types.py:24-34`, `apps/api/app/features/forecast/schemas.py:43-45,84`, `apps/api/app/features/advisory/schemas.py:13` · **Owner**: LEAD (delegated: `fix-r1-lead`)
- **Evidence**: Live probes against `/api/v1/forecast` (both `source="dataset"` and `source="live"`), `/api/v1/scenario`, and `/api/v1/heatmap` with `origin_week="9999-12-27"` (a valid Monday) all returned **HTTP 500** (`OverflowError: date value out of range` on `origin_week + timedelta(weeks=h)`). `origin_week="1900-01-01"` returned **HTTP 200** on `/api/v1/forecast` and `/api/v1/advisory`.
- **Why / Impact**: Extends CR-3 with two security gaps CR-3 did not cover: (1) even after dataset-mode bounds `[2016-02-29, 2025-12-29]` are added, `source="live"` remains crashable via `9999-12-27`; (2) `AdvisoryRequest.origin_week` (`advisory/schemas.py:13`) was omitted from CR-3 and also lacks bounds.
- **Concrete fix**: In `app/core/types.py`, enforce a safe global calendar sanity window inside `_monday()` (e.g., `DATA_START <= d <= date(2100, 12, 31)`) so `d + timedelta(weeks=4)` can never overflow in live mode, AND apply dataset-range validation `[2016-02-29, 2025-12-29]` to `ForecastRequest` (when `source=="dataset"`), `ScenarioRequest`, `AdvisoryRequest`, and `/heatmap`.

### SEC-6 [MEDIUM] Non-ASCII `X-Ops-Token` crashes `hmac.compare_digest` with unhandled `TypeError` (HTTP 500) — CWE-755 · OWASP A10:2025
- **File**: `apps/api/app/features/ops/router.py:25-26` · **Owner**: LEAD (and CORE)
- **Evidence**: Raw ASGI probe sending latin-1 header `(b"x-ops-token", b"caf\xe9")` (valid HTTP/1.1 header bytes decoded as latin-1 by uvicorn/Starlette) with `OPS_TOKEN` configured:
  `TypeError: comparing strings with non-ASCII characters is not supported` → **HTTP 500** + full traceback logged.
- **Why / Impact**: Python's `hmac.compare_digest(str, str)` rejects any non-ASCII code point (`> 0x7F`). Any malformed or adversarial `X-Ops-Token` header causes repeatable 500 errors and log noise instead of a clean `401 problem+json`. Additionally, `OPS_TOKEN="   "` is currently treated as truthy (`expected = "   "`).
- **Concrete fix**: Compare UTF-8 encoded `bytes` after stripping whitespace on `expected`: `hmac.compare_digest((x_ops_token or "").encode("utf-8"), expected.encode("utf-8"))` (included in SEC-2 snippet above).

### SEC-7 [MEDIUM] Router 404/405 bypass `problem+json` and unhandled 500s lose `request_id` and CORS headers — CWE-755 · OWASP API8:2023 / A10:2025
- **File**: `apps/api/app/core/errors.py:5,89-101`, `apps/api/app/main.py:41-55` · **Owner**: LEAD (delegated: `fix-r1-lead`)
- **Evidence**:
  1. `GET /api/v1/does-not-exist` → `404 application/json {"detail":"Not Found"}`; `DELETE /api/v1/wards` → `405 application/json {"detail":"Method Not Allowed"}` (NOT `application/problem+json`).
  2. Unhandled 500 (`GET /_boom` with `Origin: http://localhost:3000`, `X-Request-ID: boom-1`) → `status=500`, `ACAO=None`, `X-Request-ID=None`, body lacks `"request_id"`, and ERROR log emits `"request_id": "-"`.
- **Why / Impact**: (a) `errors.py:5` imports `fastapi.HTTPException` (a subclass of `starlette.exceptions.HTTPException`), so Starlette's router-raised 404/405 exceptions never match `@app.exception_handler(HTTPException)` — making lines 91-93 dead code. (b) `@app.exception_handler(Exception)` installs onto Starlette's outermost `ServerErrorMiddleware` outside `CORSMiddleware` and `RequestIdMiddleware`, stripping both correlation IDs and CORS headers on every 500 error (browsers on `:3000` see an opaque CORS failure rather than `problem+json`).
- **Concrete fix**: Change `errors.py:5` to `from starlette.exceptions import HTTPException as StarletteHTTPException` and register `@app.exception_handler(StarletteHTTPException)`. Handle unexpected `Exception` inside a pure ASGI middleware mounted **inside** `CORSMiddleware` and `RequestIdMiddleware` so 500 responses retain `request_id` and CORS headers.

### SEC-8 [MEDIUM] `RateLimitMiddleware` proxy-IP collapse, `startswith` exemption over-matching, and FIFO eviction reset — CWE-770 · CWE-307 · OWASP API4:2023 / LLM06:2026
- **File**: `apps/api/app/core/ratelimit.py:13,55-76` · **Owner**: LEAD (delegated: `fix-r1-lead`)
- **Evidence**:
  1. **Proxy IP collapse (`:67`)**: Probed behind simulated reverse proxy `10.0.0.1` (`RATE_LIMIT_PER_MINUTE=2`): 2 requests from `X-Forwarded-For: 198.51.100.1` caused the 1st request from `X-Forwarded-For: 198.51.100.2` to fail with **429**. While ignoring `X-Forwarded-For` prevents spoofing on localhost, `pyproject.toml:32` already configures `[tool.vercel]`, where all traffic arrives via a proxy and one client can DoS all users.
  2. **Prefix exemption (`:65`)**: `request.url.path.startswith(EXEMPT)` exempts any path starting with `/docs`, `/healthz`, `/readyz`, `/openapi.json`, or `/redoc`. Probed `GET /docs_not_real` 5× with `RATE_LIMIT_PER_MINUTE=1` → `[404, 404, 404, 404, 404]` (zero `429`s).
  3. **FIFO eviction resets active blocks (`:61-62`)**: When `len(self.hits) > 1000`, `self.hits.pop(next(iter(self.hits)))` deletes the oldest inserted bucket even if it is actively rate-limited, resetting its counter to zero.
- **Concrete fix**:
  - Replace `EXEMPT = (...)` + `startswith` with `EXEMPT = frozenset({"/healthz", "/readyz", "/docs", "/openapi.json", "/redoc"})` and `if request.url.path in EXEMPT:`.
  - Add an opt-in `trusted_proxies: str = ""` setting; only when `request.client.host` is in `trusted_proxies` extract the rightmost untrusted IP from `X-Forwarded-For` (never trust leftmost).
  - When evicting beyond `MAX_TRACKED_KEYS`, evict keys with the oldest `q[-1]` timestamp (LRU) rather than FIFO insertion order so active abusers stay blocked.

### SEC-9 [MEDIUM] Pip fallback lacks hash verification and re-enabled sdist execution (`--only-binary=:all:` removed); root setup uses `npm install` — CWE-494 · CWE-829 · OWASP A03:2025 / LLM04:2026
- **File**: `scripts/setup.mjs:59`, `apps/api/requirements.txt:1-2`, `apps/api/pyproject.toml:6-23`, `package.json:8` · **Owner**: LEAD
- **Differential context**: Commit `ff89e58` removed `--only-binary=:all:` from `scripts/setup.mjs:59` (`runAsync(venvPy, ["-m", "pip", "install", "-q", "-r", "requirements.txt"], ...)`).
- **Evidence**:
  - `apps/api/requirements.txt:2` was exported with `--no-hashes` (`uv export --no-dev --no-hashes ...`), so users without `uv` install 58 Python packages with zero SHA-256 artifact integrity verification and with arbitrary sdist `setup.py` execution allowed (unlike `uv sync --frozen`, which verifies hashes in `uv.lock`).
  - `apps/api/pyproject.toml:6-23` leaves 14 of 16 runtime dependencies without upper version caps (only `fastapi` and `pydantic` carry upper bounds).
  - Root `package.json:8` runs `npm install --no-audit --no-fund` instead of `npm ci --no-audit --no-fund`, which can silently modify `package-lock.json` on setup.
  - (Mitigating facts verified: `pip-audit` reports 0 known CVEs on `requirements.txt` and `uv.lock`; `npm audit --omit=dev` reports 0 CVEs; 0 packages in root/web `package-lock.json` declare `hasInstallScript`.)
- **Concrete fix**: Export `apps/api/requirements.txt` with hashes (`uv export --no-dev --format requirements-txt -o requirements.txt`) and run `pip install --require-hashes --only-binary=:all: -q -r requirements.txt` (verify wheel availability on Windows + macOS Python 3.12 first); change `package.json:8` from `npm install` to `npm ci --no-audit --no-fund --ignore-scripts` (likewise add `--ignore-scripts` to `setup.mjs:65`, verified viable because 0 packages in either lockfile use install scripts).

### SEC-10 [LOW] Unvalidated security-sensitive settings (`APP_ENV=prod`, `CORS_ORIGINS=*`, `OPEN_METEO_BASE_URL` SSRF, negative timeouts/TTL) — CWE-16 · CWE-918 · OWASP A02:2025 / API8:2023
- **File**: `apps/api/app/core/config.py:19-38,62-64`, `.env.example:5,9` · **Owner**: LEAD (delegated: `fix-r1-lead`)
- **Evidence**: Probed `Settings(...)` directly:
  - `Settings(app_env="prod").app_env == "prod"` — bypasses `settings.app_env != "production"` guards in `app/adapters/db/factory.py:58,69` (also CR-10).
  - `Settings(cors_origins="*").cors_origin_list == ["*"]` — silently accepts wildcard CORS.
  - `Settings(open_meteo_base_url="http://169.254.169.254/latest/meta-data/")` — silently accepts plaintext HTTP and cloud metadata IPs (config-level SSRF surface).
  - `Settings(weather_connect_timeout_s=-1, weather_read_timeout_s=0, llm_timeout_s=-5, weather_cache_ttl_hours=-10)` — accepted without error.
  - Minor drift: `.env.example:9` sets `CORS_ORIGINS=http://localhost:3000` while `config.py:20` defaults to `http://localhost:3000,http://127.0.0.1:3000`.
- **Concrete fix**: Normalize `"prod"` → `"production"` in a `before` validator; validate `cors_origins` entries are `http://` or `https://` origins (forbidding `*` and `null`); validate `open_meteo_base_url` requires `https://` and non-private host outside `APP_ENV=test`; add `Field(gt=0)` bounds to timeout and TTL settings.

### SEC-11 [LOW] Missing API security headers, missing `Cache-Control: no-store` on `/api/v1/ops`, and Swagger/OpenAPI enabled in production — CWE-693 · CWE-200 · OWASP A02:2025 / API8:2023
- **File**: `apps/api/app/main.py:35-55`, `apps/api/app/features/ops/router.py:30-46` · **Owner**: LEAD
- **Evidence**: Probed `GET /healthz` and `GET /api/v1/ops` headers: API emits only `content-length`, `content-type`, and `x-request-id`. Unlike `apps/web/next.config.ts:3-8`, FastAPI omits `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: no-referrer`. `/api/v1/ops` also omits `Cache-Control: no-store` (required by `docs/system-design.md:224`). `GET /docs`, `/redoc`, and `/openapi.json` remain enabled regardless of `APP_ENV`.
- **Concrete fix**: Add a minimal ASGI security-headers middleware setting `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: no-referrer`; add `Cache-Control: no-store` to `/api/v1/ops`, `/healthz`, and `/readyz`; pass `docs_url=None if is_prod else "/docs"`, `redoc_url=None if is_prod else "/redoc"`, `openapi_url=None if is_prod else "/openapi.json"` when `settings.app_env == "production"`.

### SEC-12 [LOW] Request schemas accept unknown JSON fields (`extra="ignore"`) and `ml/**` disables ruff security rules (`S`) — CWE-20 · CWE-502 · OWASP API3:2023
- **File**: `apps/api/app/features/forecast/schemas.py:41,68,82`, `apps/api/app/features/advisory/schemas.py:11`, `apps/api/pyproject.toml:47` · **Owner**: LEAD
- **Evidence**: Probed `POST /api/v1/forecast` with `{"ward_ids": ["DSCC_Ward_07"], "origin_week": "2025-08-04", "unexpected_field": "injected"}` → **HTTP 200**. On `WeatherOverride`, unrecognized keys alongside a valid key are silently dropped rather than flagged. Separately, `apps/api/pyproject.toml:47` disables all flake8-bandit (`"S"`) checks for `ml/**`, which owns `joblib` (`pickle`) serialization/deserialization (`CWE-502`).
- **Concrete fix**: Add `model_config = ConfigDict(extra="forbid")` to `ForecastRequest`, `ScenarioRequest`, `WeatherOverride`, and `AdvisoryRequest` (then re-run `npm run contracts`); replace `"ml/**" = ["S"]` in `pyproject.toml` with targeted per-rule ignores (if any are needed) so `S301`/`S324`/`S602` remain enforced on ML training and artifact scripts.

---

## 3. Verified controls (Keep)

1. **Secrets hygiene**: `.env` is untracked (`git ls-files .env` empty) and gitignored; zero secrets in tracked files or commit history `e193430..HEAD`; `ANTHROPIC_API_KEY` and `OPS_TOKEN` use `SecretStr`.
2. **Error body hygiene**: `RequestValidationError` handler (`errors.py:81-87`) strips Pydantic's `input` and `ctx` fields (verified with secret-like invalid `ward_id` — not echoed); `_unhandled` (`errors.py:96-101`) returns a static generic 500 body with zero stack trace, SQL, or exception string leakage.
3. **CORS & simple-CSRF defense**: `CORSMiddleware` sets `allow_credentials=False`, restricts methods to `GET, POST`, rejects untrusted origins (`Origin: https://evil.example` gets no `ACAO`), and FastAPI 0.165 rejects `Content-Type: text/plain` / `application/x-www-form-urlencoded` POSTs to `/api/v1/advisory` with `422` (blocking no-preflight cross-origin budget burn).
4. **Input bounds (verified working)**: `WardId` regex `^[A-Za-z0-9_-]{1,32}$` blocks traversal/injection chars; `ward_ids` capped `[1, 60]` unique; `horizons` capped `[1, 4]` unique; `WeatherOverride` enforces `[0, 500]`, `[5, 45]`, `[0, 100]` and rejects `NaN`/`Infinity`/`-Infinity` with `422`.
5. **Safe Python runner & fault guard**: `scripts/py.mjs` invokes `spawnSync` with `shell: false`; `active_faults()` (`config.py:76-81`) fails closed outside `APP_ENV=test`; zero known CVEs in `pip-audit` and `npm audit --omit=dev`.
