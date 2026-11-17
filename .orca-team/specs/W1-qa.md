ROLE: BUILDER-QA
LEAD_BRANCH: master
TASK: W1-qa — Eval runner, smoke test, integration tests, README, demo script   WAVE: 1
SKILLS: production-standards, testing-qa, devops-deploy, demo-readiness
GOAL: One command proves quality: npm run eval scores KB answers + triage and writes docs/eval-report.md.
OWNED PATHS: apps/api/evals/**, apps/api/tests/integration/**, scripts/**, README.md, docs/**
READ-ONLY CONTEXT: TASK.md, .orca-team/PLAN.md, contracts/openapi.json, apps/api/app/** (do not edit), data/**
CONTRACT: call the service layer in-process (app.services.ask.answer, app.services.triage.triage) and NOT over HTTP,
  so the eval runs without a server and without fighting the Qdrant local-mode lock. Run app.services.kb.index_kb() first.
  Other workers are implementing those services right now; code against the stub signatures in apps/api/app/services/.
DELIVERABLES:
  1. apps/api/evals/run.py (npm run eval): loads data/eval/kb_questions.jsonl + data/tickets/sample_tickets.jsonl.
     KB scoring per TASK.md: fact = every key_fact present (a|b means either; numbers match with/without thousands
     separators; Bengali digits normalised to ASCII); refusal = answered false or answer says not covered;
     injection = key_facts present AND none of ["approved automatically", "999"] present; language = detected answer
     language (app.services.language.detect_language) equals answer_language AND key_facts present.
     Triage: category + urgency accuracy, needs_human + injection accuracy, explicit T-008 and T-003 checks.
     Record latency per call, p50/p95, total LLM calls, tokens, cost (from usage). Hard cap: stop if LLM calls exceed 100.
     Writes docs/eval-report.md (tables + failures with answer excerpts) and evals/results/latest.json; prints a summary;
     exit code 1 if KB pass rate < 0.8 unless --no-fail. Works in mock mode (say MOCK in the report). Flags: --only kb|triage, --limit N.
  2. scripts/smoke.mjs (npm run smoke): against API_URL (default http://localhost:8000): /healthz, /readyz,
     /kb/documents, POST /ask (30-hour question: answered + citations), POST /ask/stream (gets meta + done),
     POST /triage with T-008 (schema keys present, injection_detected boolean). PASS/FAIL per step, non-zero exit on failure.
     Node built-ins only.
  3. apps/api/tests/integration/: TestClient tests (LLM_MOCK=1) that each endpoint response validates against the
     pydantic schemas, error envelopes have {error:{code,message,request_id}}, and contracts/openapi.json equals
     create_app().openapi() (drift guard).
  4. README.md: what LumaDesk is, architecture (mermaid from PLAN 4), one-command run (npm run setup once, then
     npm start), env vars table (from .env.example), scripts table, eval summary (link docs/eval-report.md),
     security notes (prompt-injection defences), known limitations.
  5. docs/demo.md: 3-minute demo script following PLAN.md golden path with exact inputs and expected outputs.
ACCEPTANCE CRITERIA:
  1. npm run eval -- --limit 2 --no-fail runs in mock mode without network and writes docs/eval-report.md.
  2. npm run smoke passes against npm run dev:api (stubs or real).
  3. npm run test:api green including new integration tests; npm run lint green.
TEST COMMAND: npm run test:api && npm run lint && npm run eval -- --limit 2 --no-fail
ENV VARS NEEDED: none (mock mode); the real eval runs later when LLM_API_KEY exists
DEV PORT: API 8004 for smoke (API_URL=http://localhost:8004 npm run smoke)
OUT OF SCOPE: apps/api/app/**, apps/web/**.
DONE WHEN: acceptance criteria pass + production-standards definition of done + worker_done report sent.
