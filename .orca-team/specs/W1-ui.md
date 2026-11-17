ROLE: BUILDER-UI
LEAD_BRANCH: master
TASK: W1-ui — LumaDesk web app: Ask (streaming chat), Triage, Batch, Knowledge base pages   WAVE: 1
SKILLS: production-standards, frontend-app, frontend-design, web-design-guidelines
GOAL: A clean, fast support-agent console that works first time in the demo.
OWNED PATHS (only these may be edited): apps/web/** (create the Next.js App Router + TypeScript + Tailwind app here)
READ-ONLY CONTEXT: TASK.md, .orca-team/PLAN.md (2 golden path, 5 contracts), contracts/openapi.json, data/tickets/sample_tickets.jsonl
CONTRACT: generate types with `npx openapi-typescript ../../contracts/openapi.json -o src/lib/api/schema.d.ts`;
  use openapi-fetch for JSON endpoints. SSE: POST /ask/stream returns text/event-stream with events
  meta {request_id, language}, citations [Citation], token {text} (repeated), done (AskResponse), error {code, message}.
  Use fetch + a ReadableStream SSE parser (EventSource cannot POST). API base = process.env.NEXT_PUBLIC_API_URL or http://localhost:8000.
PAGES / UX:
  - Layout: left nav (Ask, Triage, Batch, Knowledge base), LumaDesk brand, light/dark, responsive.
  - Ask: chat transcript, streaming tokens, [n] markers rendered as clickable chips; clicking opens a side panel
    with GET /kb/documents/{doc_id} content (markdown) with the cited snippet highlighted. answered=false shows a
    distinct "Not in the knowledge base" style. Usage badge (latency ms, tokens, cost USD, model) under each answer.
    Example question buttons (30-hour credit question, stock price, a Bangla one). Stop button. Error toast with retry.
  - Triage: textarea + channel select + "Load sample" dropdown T-001..T-016 (copy the jsonl into
    apps/web/src/data/sample_tickets.json). Result card: category, urgency (colour), sentiment, language, summary,
    needs_human + injection badges (injection = red shield), reasons list, suggested_reply with copy button and
    citation chips, urgency_evidence highlighted inside the original ticket text, usage badge.
    History list (GET /triage/history) below, refreshed after each triage.
  - Batch: "Run all 16 sample tickets" (POST /triage/batch) -> table: id, predicted vs label category/urgency with
    pass/fail marks, needs_human, injection; totals: category accuracy, urgency accuracy, total cost, latency.
    Loading state (it can take ~30-60 s).
  - Knowledge base: GET /kb/documents with trusted/untrusted badge + "Re-index" button (POST /kb/index) showing IndexResult.
  - Every request has loading, empty and error states; never a blank screen. Accessible (labels, focus, contrast).
SCRIPTS: apps/web/package.json: dev (port 3000 by default), build, lint, test (vitest: SSE parser + citation chip unit tests).
ACCEPTANCE CRITERIA:
  1. With the API running (stubs are fine: npm run dev:api -- --port 8003 and NEXT_PUBLIC_API_URL=http://localhost:8003),
     asking a question streams tokens and citation chips open the doc panel.
  2. Triage of a sample renders every TriageResult field; injection badge visible when true.
  3. Batch page renders the table and accuracy totals.
  4. API down gives a friendly error with retry, no crash. build and lint pass.
TEST COMMAND: npm --prefix apps/web run lint && npm --prefix apps/web run test && npm --prefix apps/web run build
ENV VARS NEEDED: NEXT_PUBLIC_API_URL (has a default)
DEV PORT: web 3001, own API 8003
OUT OF SCOPE: anything outside apps/web.
DONE WHEN: acceptance criteria pass + production-standards definition of done + worker_done report sent.
