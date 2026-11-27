# ADR-0014: Deterministic templates are the source of truth for dispatch notices

## Status
Accepted · 2026-11-27 (Phase 2)

## Context
Rubric P4/P5: SMS, WhatsApp and printable PDF/HTML commissioner briefs listing predicted cases, allocated vs required
supplies, deficit alerts and assigned crews; everything must work offline; `/exports` must hold accurate samples.

## Decision
- Notices are rendered from Jinja-style templates (Python string templates, no network) filled only with engine
  output. An LLM may later polish wording but is never on the core path and never changes a number.
- **SMS** is segment-aware: GSM-7 messages use 160 characters (153 per segment when concatenated); any Bangla text
  forces UCS-2, 70 characters (67 per segment). The response reports encoding, character count and segment count;
  templates aim for one segment in English and at most three in Bangla.
- **WhatsApp**: structured plain text with line breaks and `*bold*` labels.
- **Commissioner brief**: one HTML page with print CSS (A4 portrait), served at `GET /api/v1/dispatch/brief/{ward_id}.html`;
  `/exports` also holds a PDF rendered by Playwright from that page, so Bangla shaping is correct (no PDF library
  that breaks conjuncts).
- **Number faithfulness**: every number in every notice comes from the `NoticeFacts` object; a test extracts all
  numbers from each rendered notice and asserts each one appears in `NoticeFacts`.
- **Escaping**: ward names and every interpolated string are HTML-escaped in the brief.

## Rejected options
- **LLM-written notices** — rejected: network dependency on the core path and a risk of altered numbers.
- **Server-side PDF libraries (ReportLab, WeasyPrint)** — rejected: Bangla conjunct shaping is unreliable; the browser
  engine shapes correctly.

## Consequences
Notices are reproducible, offline and auditable. The sample files in `/exports` are produced by a script from the
running engine, not written by hand.
