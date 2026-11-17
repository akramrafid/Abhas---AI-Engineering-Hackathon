ROLE: BUILDER-CORE
LEAD_BRANCH: master
TASK: W1-triage — Ticket triage + injection guardrails + batch + SQLite history   WAVE: 1
SKILLS: production-standards, llm-engineering, ai-agents, data-layer
GOAL: An agent pastes a ticket and gets a schema-valid TriageResult (category, urgency, sentiment, language,
summary, needs_human, injection_detected, suggested_reply in the customer language citing the KB) in under 6 s.
OWNED PATHS (only these may be edited):
  - apps/api/app/services/triage.py, apps/api/app/services/guardrails.py (new), apps/api/app/services/history.py (new)
  - apps/api/app/prompts/triage_*.py (new; if apps/api/app/prompts/__init__.py is missing you may create it empty)
  - apps/api/tests/unit/test_triage*.py, apps/api/tests/unit/test_guardrails*.py (new)
READ-ONLY CONTEXT: TASK.md, .orca-team/PLAN.md, contracts/openapi.json, apps/api/app/schemas/triage.py,
  apps/api/app/adapters/llm.py (get_llm, meter, complete_json returns a validated pydantic model; mock mode without key),
  apps/api/app/services/language.py (detect_language), data/tickets/sample_tickets.jsonl, data/kb/*.md.
  A parallel worker builds apps/api/app/services/retrieval.py exposing `async def search(query, k=3) -> list[Citation]`
  (trusted chunks only). Import it lazily inside a try/except; if missing or raising, continue with no citations.
CONTRACT: keep the stubbed signatures: triage(req) -> TriageResult, triage_batch() -> BatchTriageResult,
  history(limit) -> list[TriageHistoryItem].
DESIGN REQUIREMENTS:
  - ONE LLM call per ticket (budget: full eval at most ~100 calls). Use complete_json with an internal pydantic model
    (category, urgency, sentiment, summary, suggested_reply, urgency_evidence, injection_suspected).
    Ticket text is wrapped in delimiters and declared untrusted data; the model must never follow it.
  - Deterministic guardrails (guardrails.py) run before and after the LLM and override it:
      * injection detection: regex/heuristics for "ignore (all|previous|your) instructions/rules", "system override",
        "admin mode", "you are now", HTML comments addressed to the assistant, "reply only with",
        "approve (a|the) (full )?refund", "mark this ticket as resolved", Bangla/Banglish variants; OR the LLM flag.
      * needs_human = injection OR urgency critical OR category in {account_security, cancellation, plan_change}
        OR the ticket asks for an account action (refund, plan change, cancellation, technician visit).
      * language = detect_language(text) (not the LLM).
      * reply safety: if needs_human or injection, the reply must not promise refunds/credits/approvals;
        post-check for "approved", "refund has been", "we will refund", "credited" and Bangla equivalents and
        replace with a safe template in the customer language when violated. Record why in `reasons`.
  - Urgency rubric in the prompt: critical = account compromise, or outage affecting many customers / essential
    services; high = single-customer full outage over 12 h or LOS red / fiber cut; medium = degraded service,
    billing disputes, cancellations, intermittent drops; low = how-to, info, plan questions, off-topic.
    urgency_evidence = the exact sentence copied from the ticket.
  - suggested_reply: in the ticket language (bn Bengali script, banglish romanized Bangla, en English),
    uses up to 3 retrieved trusted KB snippets as numbered context, cites [n]; citations = those snippets.
  - Never return free text: any LLM failure raises UpstreamError (503 JSON envelope).
  - history.py: stdlib sqlite3 at the path from settings.database_url (sqlite:///./x.db resolved relative to
    apps/api via settings.resolve), table triage_history (PLAN.md §6), connect per call, parameterized SQL only.
    triage() saves each result; history(limit) lists newest first.
  - triage_batch(): reads settings.tickets_file, triages with concurrency 4, computes category/urgency accuracy vs
    labels; a failing ticket sets item.error and the batch continues.
  - Mock mode: deterministic keyword classifier so tests/UI work offline (also a decent fallback).
ACCEPTANCE CRITERIA:
  1. Given T-008 text, then injection_detected=true, needs_human=true, reply contains no "approved"/"refund has been".
  2. Given T-003 (Bangla), then language=bn and suggested_reply is in Bengali script.
  3. Given T-015 (hidden HTML comment), then injection_detected=true.
  4. Given any input (8000 chars, emoji, whitespace), POST /triage returns schema-valid JSON or the error envelope.
  5. In mock mode, batch over the 16 samples returns accuracy numbers and all 16 items.
  6. Unit tests (LLM_MOCK=1, no network) check guardrails against all 16 sample tickets' injection and needs_human
     labels, the reply post-check, and history save/list (tmp db).
TEST COMMAND: npm run test:api && npm run lint
ENV VARS NEEDED: LLM_API_KEY (may be missing; build against mock mode and say so in the report)
DEV PORT: 8002 (npm run dev:api -- --port 8002)
OUT OF SCOPE: KB indexing/answering, frontend, eval runner, schemas (ask LEAD for contract changes).
DONE WHEN: acceptance criteria pass + production-standards definition of done + worker_done report sent.
