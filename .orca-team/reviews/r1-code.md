# Code review r1 — 2026-11-17 18:40 +06 — reviewer: claude / opus (Opus 5.5)
Range: `git diff e1961f6...814b5a7` (whole app; focus apps/api/app/** and apps/web/src/**)

Verdict: **FIX-BLOCKERS**

Summary: The merged code is well built. Indexing is idempotent, retrieval excludes the untrusted post, the guardrails
override the LLM, errors use one consistent shape, the SSE parser is solid and the tests are meaningful. The biggest
risk is the LLM path on the golden path:
- The new primary model returns HTTP 400 on every call. All three verified real calls were actually answered by the
  fallback model, but logs and cost report the primary (CR-1).
- 429 handling burns 3 attempts per request on a model whose quota is used up (CR-2).
- Triage pulls wrong or no KB snippets for 4 of 16 tickets, including the Bangla ones, so suggested replies can't cite (CR-3).
- Most standalone questions are treated as follow-ups, which breaks the stock-price refusal in mock mode when asked
  after the 30-hour question (CR-4).

QA deliverables (smoke, eval, README, demo) aren't merged yet, so `npm run smoke` and `npm run eval` fail at HEAD (CR-5).

Verified:
- lint ✅ — `ruff check` and `ruff format --check` clean (50 files); web `eslint` clean; `next build` ✅.
  `tsc --noEmit` ❌ on a fresh checkout, ✅ after `next typegen` (CR-14).
- tests ✅ — api: 167 passed, 16 skipped (real-model gated); web: 18 passed.
- smoke ❌ — `scripts/smoke.mjs` is missing.
- evals ❌ — `evals/run.py` is missing.
- idempotent index ✅ — `npm run index`: first run 21 upserted, second run 0 upserted / 21 unchanged / 0 deleted.
- contract ✅ — live `app.openapi()` equals `contracts/openapi.json`; `schema.d.ts` regenerates identically (only CRLF differs).
- golden path by hand ✅ (partial):
  - real LLM: step 2 (streamed "5 days of credit [1]", cites outage-sla), step 3 (refused, `answered:false`, no
    citations) and T-003 triage (Bangla reply).
  - mock mode: steps 2, 3 and 4 (T-008 `injection_detected` + `needs_human`, safe reply) and 6 (batch 16/16 items).

Real LLM usage: 10 provider requests in total.
- 4 went to the exhausted `gemini-2.5-flash`, all 429 — 3 were the adapter's own retries, 1 was my diagnostic.
- 3 user calls on the new config cost 6 requests, because each one was a primary 400 plus a fallback call.

Counts: BLOCKER 1 · HIGH 4 · MEDIUM 5 · LOW 5

## Findings

### CR-1 [HIGH] Primary model fails on every call; served model and cost misreported; healthcheck can't see it
File: `apps/api/app/adapters/llm.py:78`, `:83-102`, `:101` · `apps/api/app/healthcheck.py:22` · Owner: LEAD (adapter)

Problem: With the new `.env` (`LLM_MODEL=gemini-flash-lite-latest`, fallback `gemini-3.1-flash-lite`), every call I made
went the same way: the primary returned `BadRequestError` (400), then the fallback answered. The log for each of
`/ask/stream` ×2 and `/triage` shows `llm_error model=gemini-flash-lite-latest error=BadRequestError`, followed by
`llm_call model=gemini-flash-lite-latest ...`.

`UsageMeter.model` is fixed at creation to `settings.llm_model` (`llm.py:78`). `_create` never records which model
actually answered, so `usage.model`, the UI usage badge, the `llm_call`/`ask_done` logs and the cost all name the model
that failed.

`llm_error` is logged at INFO with only the exception class name: no status code and no provider message. The real
cause (probably a parameter, e.g. `reasoning_effort`, that this model rejects) is invisible.

`npm run healthcheck` also goes through the same silent fallback, so it prints `OK` while the primary is broken.

There are no tests for `_create`, `stream_text` or the real path of `complete_json`. `mock_fn` bypasses all of them,
which is why nothing caught this.

Why it matters:
- Every request costs 2 provider calls, which doubles quota burn on a free tier that already ran out once today.
- It adds one round trip to first-token latency.
- "Logs with cost/latency" is judged under production readiness, and right now the logs name the wrong model.

Fix (quick ops fix now): set `LLM_MODEL=gemini-3.1-flash-lite`, the model that actually served all 3 verified calls,
until the 400 cause is known.

Fix (code):
```diff
-    async def _create(self, **kwargs):  # noqa: ANN202
+    async def _create(self, meter: UsageMeter | None = None, models: list[str] | None = None, **kwargs):  # noqa: ANN202
         assert self._client is not None
-        models = [self.s.llm_model] + ([self.s.llm_fallback_model] if self.s.llm_fallback_model else [])
+        models = models or self._candidate_models()          # see CR-2
 ...
                     with attempt:
-                        return await self._client.chat.completions.create(model=model, **kwargs)
+                        resp = await self._client.chat.completions.create(model=model, **kwargs)
+                        if meter is not None:
+                            meter.model = model                  # report the model that actually answered
+                        return resp
             except (*_RETRYABLE, APIStatusError) as exc:
                 last = exc
-                log_event(log, "llm_error", model=model, error=type(exc).__name__)
+                log.warning("llm_error", extra={"data": {
+                    "model": model, "error": type(exc).__name__,
+                    "status": getattr(exc, "status_code", None),
+                    "detail": redact(str(getattr(exc, "message", exc)))[:300]}})   # server log only
```
Pass `meter=meter` from `complete_json` and `stream_text`. In `healthcheck.py`, check each configured model on its own
with `models=[m]` and print one OK/FAIL line per model.

Add unit tests with a fake `AsyncOpenAI` covering:
- 400 on the primary, then the fallback answers, and `usage.model` names the fallback;
- 429 on the primary;
- invalid JSON, then one repair retry, then `UpstreamError`;
- an error in the middle of a stream.

### CR-2 [HIGH] 429 handling retries a model with no quota left 3× on every request; Ask has no overall deadline
File: `apps/api/app/adapters/llm.py:24`, `:91-96`, `:178` · `apps/api/app/services/ask.py:166-168` · Owner: LEAD (adapter) + core-kb

Problem (LEAD asked for this explicitly):

1. `RateLimitError` is retried 3× on the same model (0.5–4 s backoff) before the fallback is tried. Today's 429 was
   `RESOURCE_EXHAUSTED … per-day … retry in 19h27m`, so retrying was pointless. One user question cost 3 requests and
   about 5 s, then ended in `upstream_unavailable`. That is exactly what I observed before the switch.
2. Nothing is remembered between requests. Once the primary is out of quota, every request pays 3 failed attempts plus
   backoff before reaching the fallback. Same for the 400s in CR-1.
3. Retry-After / Gemini's `retryDelay` is ignored. The `retry-after` header was `None`; the delay is only in the body.
4. Ask has no deadline across connect + retries + fallback. `ASK_BUDGET_S` is only checked between stream deltas
   (`ask.py:167`). The worst case is 3 attempts × 30 s × 2 models, well past the UI's 90 s stream timeout.
   Triage is fine here: `wait_for(25 s)`.
5. Errors raised while streaming (`httpx.ReadTimeout`, `RemoteProtocolError`) aren't caught at `llm.py:178`, so they
   surface as `internal_error` / 500 instead of `upstream_unavailable`.

Why it matters: when quota runs low during the demo, each question takes 2–5 s longer and burns 3× the requests.

Fix:
```diff
+_MODEL_COOLDOWN_S = {"rate_limited": 60.0, "bad_request": 600.0}
 class LLMClient:
     def __init__(...):
+        self._cooldown_until: dict[str, float] = {}
+
+    def _candidate_models(self) -> list[str]:
+        models = [self.s.llm_model] + ([self.s.llm_fallback_model] if self.s.llm_fallback_model else [])
+        now = time.monotonic()
+        live = [m for m in models if self._cooldown_until.get(m, 0.0) <= now]
+        return live or models          # all cooling down: still try once rather than fail without a call
 ...
-                    retry=retry_if_exception_type(_RETRYABLE),
+                    stop=stop_after_attempt(self.s.llm_max_retries + 1) | stop_after_delay(self.s.llm_timeout_s),
+                    retry=retry_if_exception_type((APIConnectionError, APITimeoutError)),  # 429 -> next model now
 ...
+            except RateLimitError as exc:
+                self._cooldown_until[model] = time.monotonic() + _MODEL_COOLDOWN_S["rate_limited"]
+                last = exc; ...log...
+            except APIStatusError as exc:
+                if exc.status_code in (400, 404):
+                    self._cooldown_until[model] = time.monotonic() + _MODEL_COOLDOWN_S["bad_request"]
+                last = exc; ...log...
 ...
-        except (*_RETRYABLE, APIStatusError) as exc:
+        except (*_RETRYABLE, APIStatusError, httpx.HTTPError) as exc:
             raise UpstreamError() from exc
```
For Ask, pass a per-request deadline down: `stream_text(..., timeout=remaining)` → `create(..., timeout=remaining)`
(openai accepts a per-request `timeout`), with `remaining = ASK_BUDGET_S - elapsed`.

### CR-3 [HIGH] Triage gets wrong or no KB snippets for 4 of 16 tickets, so replies can't cite (Bangla included)
File: `apps/api/app/services/triage.py:68-79` (uses strict `search(query, k=3)` from `retrieval.py:252-255`) · Owner: core-triage (+ core-kb for `search`)

Problem: I ran the triage retrieval query against the real index (no LLM):
- T-001 (30 h outage) → ONT check / Cancellation / Technician visits. No outage-sla, so the credit policy can't be cited.
- T-003 (Bangla, slow speed) → Cancellation / Account security / Uptime. All irrelevant.
- T-012 (Bangla cancellation) → `[]`.
- T-016 (Bangla fiber cut) → `[]`.

Causes:
- `search()` always uses the strict mock-mode gate (`lenient=False`) and only k=3.
- Bangla tickets have no lexical overlap with the English KB, and the dense ranking for Bangla is weak. Ask already
  works around this with `TOP_K_NON_ENGLISH=8`; triage doesn't.

The real-LLM T-003 run confirms it: the model wisely cited nothing and wrote "an agent will follow up". This fails
PLAN golden path 5 ("Bangla suggested_reply with citation") and the TASK requirement that the reply "cites the
knowledge base".

Also, `RETRIEVAL_TIMEOUT_S=3.0` loses citations on the first triage after startup: the embedder cold-loads in ~2.2 s
plus ~1.3 s for the first query.

Fix (prototyped in-process, no repo edits): every one of the 15 on-topic tickets gets its correct source doc at rank 1,
including T-001 → outage-sla, T-003 → slow speed, T-012 → Cancellation and T-016 → outage-sla. T-013 is off-topic.
```diff
-from app.services.retrieval import search  # lazy
-    query = " ".join(text.split())[:500]
-    hits = await asyncio.wait_for(search(query, k=MAX_CITATIONS), timeout=RETRIEVAL_TIMEOUT_S)
-    return [c.model_copy(update={"id": i}) for i, c in enumerate(list(hits)[:MAX_CITATIONS], start=1)]
+from app.services.retrieval import retrieve, to_citation
+_CATEGORY_HINTS = {  # deterministic, language-independent query expansion (keyword classifier already exists)
+    Category.outage: "outage credit SLA area outage",
+    Category.technical: "slow speed troubleshooting router restart",
+    Category.billing: "bill payment refund charge",
+    Category.plan_change: "change plan upgrade downgrade price",
+    Category.cancellation: "cancel cancellation notice router return fee",
+    Category.account_security: "account security hacked password OTP",
+}
+    hint = _CATEGORY_HINTS.get(guardrails.heuristic_triage(text).category, "")
+    query = f"{' '.join(text.split())[:500]} {hint}".strip()
+    result = await asyncio.wait_for(retrieve(query, lenient=not get_llm().mock), timeout=RETRIEVAL_TIMEOUT_S)
+    return [to_citation(i, c, query) for i, c in enumerate(result.chunks[:MAX_CITATIONS], start=1)]
```
Also warm the embedder in the FastAPI `lifespan` (`await get_embedder().embed(["warmup"])`), or raise the retrieval
timeout for the first call. Add a test that T-001, T-003 and T-016 each retrieve their source doc. The real-embedding
gated test file is the right place.

### CR-4 [HIGH] Most standalone questions are treated as follow-ups, so earlier topics leak into retrieval
File: `apps/api/app/services/ask.py:38-40`, `:94-100` · Owner: core-kb

Problem: `_retrieval_query` adds the previous user question whenever `tokenize(question)` has ≤ 5 tokens. After stop
words are removed, typical full questions have 1–4 tokens: "What is LumaNet's stock price?" → `['s','stock','price']`,
"Who is the CEO of LumaNet Fiber?" → `['ceo']`, "How long do approved refunds take?" → 4 tokens. They all count as
follow-ups.

Reproduced in-process with history = [30-hour question] in mock mode:
- "What is LumaNet's stock price?" → `answered: true`, cites outage-sla. It should refuse.
- "Who is the CEO…?" → `answered: true`, cites outage-sla.

In real mode the previous topic's chunks fill 2–4 of the 5 context slots (e.g. refunds question → 2 outage chunks).

Why it matters: the golden path asks step 2 (30 h) and then step 3 (stock price) in the same conversation. In mock
mode, the fallback if quota fails again, step 3 now gives a wrong grounded-looking answer. In real mode it relies
entirely on the LLM ignoring irrelevant context.

Fix:
```diff
-SHORT_QUESTION_TOKENS = (
-    5  # shorter follow-ups ("and for 48 hours?") borrow the previous question for retrieval
-)
+MAX_FOLLOW_UP_TOKENS = 2  # "and for 48 hours?" -> ['48', 'hour']
+_FOLLOW_UP_RE = re.compile(r"^\s*(and|also|or|then|what about|how about)\b|\b(it|that|this|those|them|same)\b", re.I)
 def _retrieval_query(req: AskRequest) -> str:
-    if len(tokenize(req.question)) <= SHORT_QUESTION_TOKENS:
+    if len(tokenize(req.question)) <= MAX_FOLLOW_UP_TOKENS or _FOLLOW_UP_RE.search(req.question):
```
Add the regression test: stock price asked after the 30-hour question → `answered is False`.

### CR-5 [BLOCKER] MUST deliverables missing at HEAD: smoke, eval runner, README, demo script, eval report
File: `package.json` (`smoke` → `scripts/smoke.mjs`, `eval` → `apps/api/evals/run.py`) · Owner: QA (W1-qa not merged yet)

Problem: `scripts/`, `docs/`, `README.md` and `apps/api/evals/run.py` don't exist on the review branch.
`npm run smoke` and `npm run eval` therefore fail.

Why it matters: the TASK deliverables (README with diagram, eval report, `docs/demo.md`) and 20% "production
readiness" depend on them. This is a ship gate, not a defect in the merged code.

Fix: merge W1-qa, then re-run `npm run smoke` against a live API and `npm run eval`. Budget the eval run for the free
tier: with CR-1 and CR-2 unfixed, every call is 2 requests.

### CR-6 [MEDIUM] Golden-path citation highlights the wrong row of the credit table
File: `apps/api/app/services/ask.py:181-185`, `apps/api/app/services/retrieval.py:230-238` · Owner: core-kb

Problem: For the real 30-hour answer ("…more than 24 and up to 48 hours, you receive 5 days of credit [1]…"), citation
[1] carries the snippet "One day of credit equals the monthly plan price divided by 30…", not the row
"More than 24 and up to 48 hours — 5 days of credit". `excerpt()` scores lines by word overlap with the question plus
the whole answer. The later sentences pull it toward the footnote line, so the doc drawer highlights the wrong line.

Fix: give each citation's snippet the sentence(s) that cite it rather than the whole answer:
```python
def _citing_text(answer: str, n: int) -> str:
    return " ".join(s for s in re.split(r"(?<=[.!?।])\s+", answer) if f"[{n}]" in s)
# excerpt(chunk.text, f"{req.question} {_citing_text(text, c.id) or text}")
```
Optionally give numeric tokens a tie-break bonus in `excerpt`.

### CR-7 [MEDIUM] No demo-safety path: an LLM outage turns Ask into an error, though an extractive answer already exists
File: `apps/api/app/services/ask.py:113-118`, `:166-168` · Owner: core-kb / LEAD

Problem: production-standards §11 asks for `DEMO_REPLAY=1`, which isn't implemented. Today's quota exhaustion turned
every Ask into `upstream_unavailable`. `_mock_stream` (extractive answer from the top chunk) already exists, but it's
used only when `LLM_MOCK=1` is set at startup.

Fix: if `_generate` raises `UpstreamError` before the first token, fall back to `_mock_stream(result.chunks, meter)`.
That path only runs when strict-gate retrieval finds evidence; tag `usage.model="extractive-fallback"` so the UI badge
is honest. For triage, fall back to `_mock_output` on the same condition (the guardrails still apply).

### CR-8 [MEDIUM] Batch triage costs 16–32 provider requests per click with no cache or cooldown
File: `apps/api/app/services/triage.py:212-263`, `apps/api/app/api/routes/triage.py:20-23` · Owner: core-triage

Problem: each POST `/triage/batch` re-runs 16 LLM calls (32 requests while CR-1 stands), 4 at a time. That bursts past
free-tier per-minute limits, and the results also feed history. A double click or a page reload during the demo doubles it.

Fix: cache the last `BatchTriageResult` in memory, keyed by the tickets file hash and model, for e.g. 10 minutes; add a
`force` query flag. Or keep a module-level lock so concurrent batch requests share one run.

### CR-9 [MEDIUM] `/readyz` doesn't check its dependencies
File: `apps/api/app/api/routes/health.py:13-20` · Owner: LEAD

Problem: `/readyz` only reports the LLM mode and whether `kb_dir` exists. It doesn't check Qdrant (folder lock or
collection), SQLite or the point count. If the API can't open `.qdrant`, `/readyz` is still green while every Ask returns 503.

Fix: `await asyncio.wait_for(get_vector_store().count(), 2)` → `"vector_store": "ok" | "fail"` plus
`"kb_points": n` (0 → "not indexed"). Do the same for an SQLite `SELECT 1`. Return 503 when any check fails.

### CR-10 [MEDIUM] Unhandled 500s lose the request id
File: `apps/api/app/core/middleware.py:18-35`, `apps/api/app/core/errors.py:46-49` · Owner: LEAD

Problem: verified with TestClient. A route raising `RuntimeError` with `x-request-id: abc123` returns
`{"error": {..., "request_id": "-"}}` and no `x-request-id` header. `RequestContextMiddleware` resets the contextvar in
`finally` before the outermost `ServerErrorMiddleware` runs the `Exception` handler. The 500s are exactly the errors
you need to correlate.

Fix: catch inside the middleware:
```diff
         try:
             response = await call_next(request)
+        except Exception:
+            log.exception("unhandled_error")
+            response = JSONResponse(_body("internal_error", "Something went wrong. Please try again."), 500)
-            response.headers["x-request-id"] = rid
+        response.headers["x-request-id"] = rid
```
Keep the access-log and reset logic as they are.

### CR-11 [LOW] Leaked `[[NO_ANSWER]]` marker / refusal mid-answer is reported as answered
File: `apps/api/app/services/ask.py:57-64`, `:176-180` · Owner: core-kb

Problem: `_MarkerGate` only catches a leading marker. If the model writes "Sorry. [[NO_ANSWER]] …":
- the marker is streamed to the client (and visible until `done` replaces the text);
- `answered` stays `true`, with no "Not in KB" badge.

Answers with no citations are also kept as `answered: true` (`ask.py:187`).

Fix: `refused = gate.refused or NO_ANSWER_MARKER in raw_text`. In the UI, show an "unverified (no citation)" badge when
`answered && citations.length === 0`.

### CR-12 [LOW] Refusals show a "Sources" row while streaming
File: `apps/web/src/components/ask/ask-workspace.tsx:198-204`, `:499-520` · Owner: ui-web

Problem: the server sends the 5 retrieved context chunks before any token. For the stock-price question, the UI shows 5
source chips until `done` clears them. That's a visible flash on golden-path step 3, whose acceptance says "no citations".

Fix: while `isStreaming`, render only chips whose `[n]` already appears in `content`, or hide the row until `done`.

### CR-13 [LOW] Mock-mode triage accuracy is 100% by construction
File: `apps/api/app/services/guardrails.py:405-445` · Owner: QA (eval report)

Problem: the mock keyword classifier was written against the same 16 labelled tickets. `/triage/batch` in mock mode
reports 1.0 / 1.0.

Fix: the eval report and the batch page must label the mode (`usage.model == "mock"`) and never present mock accuracy
as model accuracy.

### CR-14 [LOW] `npm --prefix apps/web run typecheck` fails on a fresh checkout
File: `apps/web/package.json:10` · Owner: ui-web

Problem: `src/app/layout.tsx(44,50): error TS2304: Cannot find name 'LayoutProps'`. The type is generated by Next, so
it only exists after `next build`, `next dev` or `next typegen`.

Fix: `"typecheck": "next typegen && tsc --noEmit"`.

### CR-15 [LOW] Small hygiene items
- `.env.example:10` advertises `EMBEDDING_PROVIDER=openai`, but `get_embedder()` rejects anything except `local`. Fix
  the comment.
- There is no OpenAPI drift test, although no drift exists today. Add
  `assert create_app().openapi() == json.load(open(contracts/openapi.json))`.
- `AskRequest.question` (`schemas/ask.py:21`) accepts a whitespace-only string, which spends an LLM call in lenient
  mode. Strip it and require min length 1 after stripping.
- `guardrails.py:151` treats `\bOTP\b` as a compromise signal, so any benign "my bKash OTP didn't arrive" ticket is
  forced to `critical` + `needs_human`. Require phishing context, e.g. `asking for my OTP|shared (my )?OTP`.

## Keep (done well)
1. **Idempotent, safe indexing**: uuid5 point ids plus a content hash that includes the model; upsert before delete;
   a missing KB dir fails loudly instead of wiping the index; clear lock error. Verified 21 → 0 upserts.
2. **Grounding defences**: untrusted docs are filtered both in the Qdrant filter and in the lexical corpus; tag
   break-outs are neutralised; citations are renumbered to only those used; the marker is hidden across token
   boundaries. Tests for each.
3. **Deterministic triage guardrails** that always win over the LLM (injection en/bn/banglish, needs_human rules,
   promise filter with negation, language check, evidence grounding). The web SSE parser handles CRLF and chunk
   splits, with tests.
