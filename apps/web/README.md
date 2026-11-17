# LumaDesk Web Console (`apps/web`)

Next.js App Router + TypeScript + Tailwind CSS console for LumaNet Fiber support agents.

## Pages

- `/` (**Ask**): Grounded streaming Q&A over `POST /ask/stream` (SSE), clickable `[n]` citation chips opening a side document viewer (`GET /kb/documents/{doc_id}`) with cited snippet highlighting, refusal styling (`answered=false`), usage telemetry badge, example prompts (30-hour outage credit, stock price, Bangla outage credit), Stop button, and retryable error handling.
- `/triage` (**Triage**): Single-ticket triage (`POST /triage`) with channel selector, `T-001`–`T-016` sample loader (`src/data/sample_tickets.json`), urgency-evidence highlighting inside the original ticket text, red-shield injection alert, copyable suggested reply with citation chips, and live triage history (`GET /triage/history`).
- `/batch` (**Batch**): Evaluates all 16 labelled sample tickets (`POST /triage/batch`) with progress state, accuracy totals (`category_accuracy`, `urgency_accuracy`, cost, latency), and per-ticket pass/fail comparison table.
- `/kb` (**Knowledge base**): Lists indexed documents (`GET /kb/documents`) with `Trusted` / `Untrusted` badges, full markdown document viewer, and idempotent `Re-index` (`POST /kb/index`) summary.

## Environment variables

- `NEXT_PUBLIC_API_URL` (optional, defaults to `http://localhost:8000`) — base URL for the LumaDesk FastAPI backend.

## Scripts

```bash
npm run dev        # Start Next.js dev server (default port 3000; pass `-p 3001` for secondary dev port)
npm run build      # Production build
npm run lint       # ESLint check
npm run typecheck  # TypeScript strict typecheck (`tsc --noEmit`)
npm run test       # Vitest unit tests (SSE parser + citation chips & markdown sanitization)
npm run api:types  # Regenerate src/lib/api/schema.d.ts from ../../contracts/openapi.json
```
