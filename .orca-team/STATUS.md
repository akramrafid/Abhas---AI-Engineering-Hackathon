# STATUS.md — LEAD's live log (recovery file: a new LEAD resumes from here)

## Now
Phase: 7 — r1 fixes merged, QA deliverables done by LEAD; real eval pending (killed by low memory) · Deadline 20:40 passed · Updated 22:40
Next action: wait for worker_done; merge in order kb -> triage -> qa -> ui; then review round 1.
Run: run_2da4f3362a3e · LEAD_BRANCH: master

## Tasks
| Task id | Role | Title | Agent / model | Branch/worktree | Dispatch id | Wave | State |
|---|---|---|---|---|---|---|---|
| task_bc3f1de230e7 | CORE | KB indexing + grounded Ask | claude sonnet high | core-kb | ctx_df7807425459 | 1 | running |
| task_c19115f2d100 | CORE | Triage + guardrails | agy claude-sonnet-5-5-high | core-triage2 | ctx_fd327b2840f6 | 1 | running |
| task_e4ebf6ff7dba | UI | Ask/Triage/Batch web | agy gemini-4-hydrogen-xhigh | ui-web2 | ctx_e94dd6c77b07 | 1 | running |
| task_c74d2830207f | QA | evals, smoke, README, demo | opencode | qa | ctx_5ed000fb2994 | 1 | running |

## Credentials
See CREDENTIALS.md. Open: LLM_API_KEY (asked 17:45). Everything else local.

## Model switches
| Time | Role | From -> To | Reason |
|---|---|---|---|
| 18:20 | CORE triage | agy "Claude Sonnet 5.5 (Thinking)" -> agy claude-sonnet-5-5-high | AGENTS.md display names rejected; real agy IDs from `agy models` |
| 18:20 | UI | agy "Gemini 4 Hydrogen" + effort -> gemini-4-hydrogen-xhigh | same; effort is encoded in the model id |

## Assumptions
- /data was missing: LEAD generated synthetic data matching TASK.md (6 KB docs incl. untrusted forum post, 16 labelled tickets incl. T-003 Bangla + T-008 injection, 15 eval questions). Replace with official data if provided.
- Deadline = kickoff 17:40 + 3 h = 20:40.
- Embeddings local (fastembed multilingual MiniLM, 384-d) to avoid a second credential and keep Bangla support.
- Untrusted docs are indexed (visible in KB page) but excluded from answer context.

## Decisions (short ADR log)
- ADR-1: Qdrant local mode because no Docker; rejected Qdrant Docker; revisit if Docker appears.
- ADR-2: SQLite stdlib for triage history; rejected Postgres (no Docker).
- ADR-3: SSE via POST /ask/stream + sync POST /ask for evals.
- ADR-4: Deterministic guardrails override LLM for injection / needs_human / language; one LLM call per ticket (budget).
- ADR-5: Eval calls services in-process (avoids Qdrant local-mode lock vs running API).

## Review rounds
| Round | Code verdict | Security verdict | Open BLOCKER | Open HIGH |
|---|---|---|---|---|

## Merged into LEAD_BRANCH
- a520fcf lead skeleton
- akramrafid/core-triage2 (W1-triage), akramrafid/ui-web2 (W1-ui), akramrafid/core-kb (W1-kb; real-LLM 15/15 on kb_questions)
- 11e906b lead: test isolation fixture + CLI error
- Review r1 started: code ctx_4a46558b4c43 (claude opus xhigh), security ctx_4c6bb91cd90b (agy gemini-4-argon-high)
- 19:15 LLM gemini-2.5-flash free tier exhausted (20/day) -> gemini-flash-lite-latest + fallback gemini-3.1-flash-lite
| 18:55 | QA | opencode -> LEAD (self) | no output after 50 min; agy/claude pools at cap |
| 1 | FIX-BLOCKERS (B1 H4 M5 L5) | FIX-BLOCKERS (H3 M3 L1) | 0 (CR-5 done) | CR-4 unverified (core-kb hit limit) |
