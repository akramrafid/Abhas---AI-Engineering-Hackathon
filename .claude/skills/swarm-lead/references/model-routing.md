# Model routing — the one place that says which model plays which seat

Skills name **seats** (LEAD, DESIGN, UI, UI-2, CORE, DATA, QA, REVIEWER-CODE, REVIEWER-SEC, OUTSIDER). This file
maps seats to models. Change models here only.

**Project Abhas (set by LEAD from `docs/KICKOFF-PROMPT.md` §1):** only two agents are used — Claude Code
(Opus 5.5) and Antigravity (Gemini 4 Neon, Gemini 4 Hydrogen). Sonnet 5.5, Kimi K3.1 Pro, Muse Wonder and
OpenCode are not used. Every builder seat runs on Neon xhigh except the brand seat UI-2 (Hydrogen xhigh).
Opus is kept for LEAD and for checking Gemini-written work.

## Seats
| Seat | Roles | Primary: agent · model · effort | When its limit runs out (in order) |
|---|---|---|---|
| LEAD | 1 requirements · 3 architecture · 8 integration | claude · Opus 5.5 (`opus`) · max | agy · Gemini 4 Neon · max |
| DESIGN | 4 system design · critiques of PRD and architecture | agy · Gemini 4 Neon · max | agy · Gemini 4 Hydrogen · xhigh → claude · `opus` · max (Claude slot free) |
| UI (`ui-dashboard`) | 2 UX · 10 frontend | agy · Gemini 4 Neon · xhigh | agy · Gemini 4 Hydrogen · xhigh → claude · `opus` · max (Claude slot free) |
| UI-2 (`ui-brand`) | brand kit, `/brand` page | agy · Gemini 4 Hydrogen · xhigh | agy · Gemini 4 Neon · xhigh → claude · `opus` · max (Claude slot free) |
| CORE (`core-forecast`) | 5 AI engineering · 9 backend · 15 LLMOps | agy · Gemini 4 Neon · xhigh | agy · Gemini 4 Hydrogen · xhigh → claude · `opus` · max (Claude slot free) |
| DATA (`data-pipeline`) | 6 data · 7 database | agy · Gemini 4 Neon · xhigh | agy · Gemini 4 Hydrogen · xhigh → claude · `opus` · max (Claude slot free) |
| QA (`qa-*`) | 11 evals · 12 SQA · 14 deploy prep · 16 demo & docs | agy · Gemini 4 Neon · xhigh | agy · Gemini 4 Hydrogen · xhigh → claude · `opus` · max (Claude slot free) |
| REVIEWER-CODE | code review of all code (all builder code is Gemini-written) | claude · `opus` · max | LEAD reviews the merge itself (LEAD is not the author) |
| REVIEWER-SEC | 13 red team · security review | claude · `opus` · max; agy · Gemini 4 Neon · xhigh for LEAD-written contracts and core | agy · Gemini 4 Neon · xhigh |
| OUTSIDER | hallway test (UX) · scored dry run (docs) | claude · `opus` · max, fresh session with no project context | none — must be Claude (UI and docs are Gemini-written) |

## Rules
1. **Out of quota → Gemini 4 Neon xhigh**; if Neon is out too → Gemini 4 Hydrogen xhigh → Claude Opus 5.5
   (only when the Claude slot is free).
2. **Checker ≠ author family.** Families: Anthropic (Opus) · Google (Neon, Hydrogen). All review of
   Gemini-written code is done by Opus; LEAD-written (Opus) code is checked by Neon. When a fallback puts a
   checker in the author's family, LEAD adds a second checker from the other family and logs it in STATUS.md.
3. **Claude budget:** LEAD + at most one Opus worker at a time (REVIEWER-CODE, REVIEWER-SEC or OUTSIDER, one
   at a time). When Opus runs low, batch reviews per wave instead of per merge.
4. **Antigravity ≤ 4 workers at once.** Six builder seats share one Antigravity quota (Neon and Hydrogen may
   share it): queue work rather than over-book. Keep Neon max (DESIGN) tasks short.
5. Every `LIMIT HIT` is logged in STATUS.md "Model switches".

## Exact names for `worker-start`
```
--agent claude       --model opus    --effort max      # Claude Opus 5.5
--agent antigravity  --model "Gemini 4 Neon"      --effort max | xhigh
--agent antigravity  --model "Gemini 4 Hydrogen"  --effort xhigh
```
Names must match what each tool shows (`/model` in agy and Claude). If a name or effort level is rejected:
start without it, note it in STATUS.md "Model switches", and fix this file.

## Quota pools
Claude Code (Opus) · Antigravity Gemini (Neon, Hydrogen — may share one quota). A fallback inside an
exhausted pool doesn't help.
