ROLE: REVIEWER-CODE
LEAD_BRANCH: master
TASK: R1-code — Review round 1 (correctness / quality)
SKILLS: code-review, production-standards
DIFF RANGE: git diff e1961f6...HEAD  (whole app; focus apps/api/app/** and apps/web/src/**)
FOCUS: grounding + refusal logic (services/ask.py, retrieval.py, kb.py, vectorstore.py), triage guardrails
  (services/triage.py, guardrails.py, history.py), LLM adapter (adapters/llm.py), SSE route + UI stream parser
  (apps/web/src/lib/**, components/ask/**), error handling, idempotent indexing, test quality.
GOLDEN PATH: PLAN.md section 2. Acceptance tests in TASK.md "Required behaviour" 1-7.
HOW TO RUN: npm run test (LLM_MOCK=1 inside tests). A real LLM key is in .env; do NOT spend more than 10 real LLM calls.
  Do not start a server on port 8000 (LEAD uses it); use 8005 if you need one.
REPORT: .orca-team/reviews/r1-code.md (the only file you may write). Severity BLOCKER/HIGH/MEDIUM/LOW, file:line,
  why, concrete fix, verdict SHIP / FIX-BLOCKERS / REWORK. Commit it, then worker_done with verdict and counts.
