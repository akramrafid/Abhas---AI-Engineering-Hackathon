---
name: code-review
description: REVIEWER-CODE protocol - verify by running lint, tests, smoke and the golden path, then review the diff for correctness against acceptance criteria, contract consistency across merged slices, error handling, async and resource misuse, data integrity, test quality, AI-specific quality and frontend states. Uses fixed severity definitions, a verdict rule, a RACE comparison rubric and a report template with concrete patches. Use when assigned a code review round or asked to pick a RACE winner.
---

# Code Review

You are the last line of defence before judges see the product. Be specific, verify claims by running code,
propose patches — don't rewrite the codebase. Read-only except your report file.

## 1. Procedure
1. Read `TASK.md`, PLAN.md §2 (golden path) and §3 (MUST features + acceptance criteria), your spec (diff range).
2. Verify mechanically — record each result in the report:
   `npm run lint` · `npm run test` · start the app (`npm run dev:api -- --port 8010`, web if relevant) ·
   `SMOKE_API_URL=http://localhost:8010` smoke (PowerShell: `$env:SMOKE_API_URL="http://localhost:8010"; npm run smoke`) ·
   walk the golden path by hand (curl or browser) · `npm run eval` if LLM features changed.
3. Read the diff (`git diff <range> --stat`, then file by file). Start with schemas/contracts, then services,
   adapters, routes, UI, tests.
4. Check integration across slices: UI calls match the contract; CORE returns what UI expects; error shapes
   handled in UI; env vars documented.
5. Write findings. Only report what you can point to (`file:line`) and explain. Mark uncertainty explicitly.

## 2. Checklist
**Correctness** — acceptance criteria met · edge cases (empty, huge, unicode, duplicates, concurrent) ·
off-by-one/pagination · time zones (UTC) · idempotency of retried writes.
**Contract** — response bodies validate against schemas · status codes · problem+json errors · exported
`contracts/openapi.json` matches code (drift test passes).
**Reliability** — timeouts on every external call · retries only for transient errors · fallbacks · no
swallowed exceptions · readiness checks real dependencies.
**Async/resources** — no blocking I/O in async handlers (`requests`, sync DB, `time.sleep`) · awaited
coroutines · clients created once (lifespan) and closed · no shared mutable state across requests.
**Data** — transactions around multi-step writes · constraints/indexes · migrations reversible-safe · no N+1
on the demo path · seed idempotent.
**AI quality** — prompts in versioned files · structured outputs validated + repaired · grounding/citations ·
"I don't know" path · token caps · cost/latency logged · eval set present and passing threshold · mock and
replay modes work.
**Frontend** — types generated from contract · loading/empty/error states · streaming with Stop · sanitised
Markdown · test IDs on golden path · no secrets/provider calls in browser.
**Tests** — assert behaviour not just status · error paths covered · fakes instead of network · no sleeps.
**Maintainability** — layering respected (routes thin, services framework-free) · no dead code/TODO in MUST
features · names clear · duplicated logic from parallel merges removed.
**Production-standards anti-patterns** — any one is at least HIGH.

## 3. Severity and verdict
| Severity | Meaning |
|---|---|
| BLOCKER | Golden path broken · build/tests red · crash/data loss · secret exposed · contract mismatch causing errors |
| HIGH | Wrong result in a MUST feature · unhandled boundary error → 500 · missing timeout · race condition · core logic untested · production-standards anti-pattern |
| MEDIUM | Will bite during the event: fragile code, missing edge case off the golden path, perf issue off the demo path |
| LOW | Naming, small refactors, docs |
Verdict: any BLOCKER → `FIX-BLOCKERS` (or `REWORK` if the design is wrong, e.g. slices don't fit the contract
or the wrong approach for a MUST) · only HIGH and below → `FIX-BLOCKERS` if any HIGH is on the golden path,
else `SHIP` · none → `SHIP`.

## 4. RACE comparison (when asked to pick a winner)
Gate: tests pass. Then score each branch 1–5 on: acceptance-criteria coverage · correctness on edge cases ·
simplicity (code size, dependencies) · latency/cost · readability and fit with the codebase. Table + winner +
one paragraph why + anything worth porting from the losers.

## 5. Report — `.orca-team/reviews/r<N>-code.md`
~~~markdown
# Code review r<N> — <date/time> — reviewer: <agent/model>
Verdict: SHIP | FIX-BLOCKERS | REWORK
Summary: <3 lines: overall state, biggest risk, what's solid>
Verified: lint ✅/❌ · tests ✅/❌ (<n> passed) · smoke ✅/❌ · golden path by hand ✅/❌ · evals <rate>
Counts: BLOCKER <n> · HIGH <n> · MEDIUM <n> · LOW <n>

## Findings
### CR-1 [BLOCKER] <short title>
File: `path/to/file.py:123` · Owner: <role / branch>
Problem: <what is wrong, with evidence (command output, input that breaks it)>
Why it matters: <impact on demo/users/judging>
Fix:
```diff
- old
+ new
```

## Keep (max 3 things done well)
~~~
Commit the report (`git add .orca-team/reviews/r<N>-code.md && git commit -m "review: r<N> code"`), then send
`worker_done` with verdict and counts.
