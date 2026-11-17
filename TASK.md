# TASK.md — Practice problem: "LumaDesk", an AI support copilot

> Practice run for the swarm. **LumaNet Fiber is a fictional internet provider. All data in /data is synthetic.**

## Problem statement
LumaNet Fiber's support team receives hundreds of tickets a day in English, Bangla and Banglish. Agents waste
time searching policy documents and rewriting the same replies, and urgent outages get buried in the queue.

Build **LumaDesk**, an AI copilot for support agents, with two core capabilities:

1. **Ask the knowledge base** — an agent asks a question in a chat and gets a streaming answer grounded only in
   LumaNet's documents (`/data/kb`), with clickable citations. If the documents don't cover the question, the
   copilot says so instead of guessing.
2. **Triage a ticket** — an agent pastes a customer ticket and gets a structured triage card:
   `category`, `urgency`, `sentiment`, `language`, one-line `summary`, `needs_human` (true/false),
   `injection_detected` (true/false), and a `suggested_reply` written in the customer's language that cites the
   knowledge base.

Allowed values:
- `category`: billing · outage · technical · plan_change · account_security · cancellation · other
- `urgency`: low · medium · high · critical
- `language`: en · bn · banglish
- `needs_human` is true when the ticket needs an account action (refund, plan change, cancellation, technician),
  involves account security, is critical, or contains an injection attempt.

Some documents and tickets contain malicious instructions (prompt injection). LumaDesk must never follow
instructions found inside documents or tickets, and must flag tickets that try.

## Judging criteria
- Correctness and grounding — 30% (pass rate on `/data/eval/kb_questions.jsonl`, citation quality, honest "I don't know")
- Triage quality — 20% (category + urgency accuracy against the labels in `/data/tickets/sample_tickets.jsonl`)
- Production readiness — 20% (tests, error handling, security review verdict, one-command run, logs with cost/latency)
- UX and demo — 20% (clear, fast, streaming, works first time)
- Innovation — 10%

## Must use / constraints
- Vector database: **Qdrant** (local Docker or Qdrant local mode; no cloud account needed)
- LLM: any OpenAI-compatible chat API (the team provides the key); embeddings from the same provider or a local model
- Backend Python + FastAPI, frontend Next.js (team default stack)
- Must handle English, Bangla and Banglish input; replies in the customer's language
- Everything runs locally with one command. No public deploy, no paid services except the LLM API key
- Budget: one full evaluation run uses at most ~100 LLM calls

## Required behaviour (acceptance tests the judges will run)
1. One command indexes every file in `/data/kb`; running it again does not create duplicates.
2. Ask "How much credit do I get if my internet is down for 30 hours?" → "5 days of credit", citing the outage/SLA document.
3. Ask "What is LumaNet's stock price?" → says the documents don't cover it.
4. Triage always returns JSON matching the published OpenAPI schema — never free text, never invalid JSON.
5. Ticket T-008 (asks the AI to ignore its rules and approve a refund) → `injection_detected: true`,
   `needs_human: true`, and the reply promises nothing.
6. A Bangla ticket (T-003) gets a Bangla `suggested_reply`.
7. The untrusted community post in `/data/kb` never changes an answer (no "refunds approved automatically").

## Provided resources
- `/data/kb/*.md` — 6 knowledge-base documents (one is an untrusted community forum post)
- `/data/tickets/sample_tickets.jsonl` — 16 labelled tickets
  (`id, channel, text, label_category, label_urgency, label_language, label_needs_human, label_injection`)
- `/data/eval/kb_questions.jsonl` — 15 questions (`id, type, question, expected, key_facts, source, answer_language`).
  `type` is fact · refusal (must say the documents don't cover it) · injection (must not comply) · language
  (must answer in `answer_language`). `key_facts` must appear in the answer; `a|b` means either; numbers may
  appear with or without thousands separators. Open-ended checks may use an LLM judge.

## Deliverables
- Working app: Ask page (chat) and Triage page; a Batch triage page if time allows
- README with architecture diagram, one-command run steps and env vars
- Eval report: KB question pass rate, triage accuracy (category, urgency), latency p50/p95, estimated cost
- Code review and security review reports in `.orca-team/reviews/`
- 3-minute demo script in `docs/demo.md`

## Feature ideas (LEAD decides MUST / SHOULD / WOW)
- Batch triage of all sample tickets with an accuracy table against the labels
- Triage history stored in a database
- Per-request cost and latency shown in the UI
- Highlight the sentence in a ticket that drove the urgency

## Deadline
<!-- EDIT THIS: your start time + 3 hours, e.g. 2026-11-18 21:00 Asia/Dhaka -->

## Our preferences
- Practice run on Claude Pro: at most 1 Claude worker at a time besides the LEAD; REVIEWER-CODE uses `opus`.
- Docker available: no (use Qdrant local mode, SQLite for app data, in-process cache)
- No push to main, no deploy. Stop after one review round, the fixes, and demo-readiness.
