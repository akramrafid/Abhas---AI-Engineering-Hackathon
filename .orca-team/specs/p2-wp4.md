ROLE: CORE · Gemini 4 Neon (XHigh) · hat build
LEAD_BRANCH: version-onsite-final   TASK: p2-wp4 — Dispatch notices, commissioner brief and /exports (rubric P5 10 pts, P4)
SKILLS: production-standards, backend-engineering, webapp-testing, verification-before-completion
READ FIRST: docs/contracts-phase2.md §2.4, §2.5 · docs/algorithms-phase2.md §6 · ADR-0014 · DESIGN.md (brand, for the
  brief's print styling: Ink/Navy/Royal, Manrope, Noto Sans Bengali, risk colours only for risk with label + meter).
DEPENDS ON: WP0 merged. Start with fixtures; switch to the live allocation runner once WP1 merges.

OWNED PATHS
- apps/api/app/features/dispatch/** (service, templates, deps, router)
- scripts/export_samples.mjs (new; `npm run exports`): starts the API (with-server), calls dispatch for a pinned scenario
  (origin 2024-08-05, Dhaka South, stock 60 %, 10 crews), writes /exports/sms_en.txt, sms_bn.txt, whatsapp_en.txt,
  whatsapp_bn.txt, brief_DSCC_Ward_04_en.html, brief_DSCC_Ward_04_bn.html and the two PDFs via Playwright, plus
  /exports/README.md naming the commit and inputs
- /exports/** (generated, committed) · apps/api/tests/features/dispatch/** (new)

ACCEPTANCE CRITERIA
- WP4-1 (P4/P5) Given a ward with deficits and crews, when dispatch/notices runs with all channels, then SMS, WhatsApp
  and brief_url each list predicted cases, allocated vs required supplies, the deficit alert and assigned crews.
- WP4-2 Given lang "en", then the SMS is GSM-7 and one segment; given "bn", UCS-2 and ≤ 3 segments, with encoding,
  characters and segments reported correctly (D1–D5).
- WP4-3 (faithfulness) Given any rendered notice, then every number in it appears in NoticeFacts.
- WP4-4 (security) Given a ward name containing HTML, then the brief escapes it (D6); the brief loads no external asset.
- WP4-5 (offline) Given ABHAS_OFFLINE=1 and the socket guard, then dispatch and the brief work with zero network calls.
- WP4-6 (P5) Given `npm run exports`, then /exports holds the eight files and README.md with the git SHA they came from.

TESTS: D1–D6; number-faithfulness over all wards of the pinned scenario in both languages; brief HTML snapshot;
socket-guard test.
GATE TO PASS: npm run ci · node .orca-team/tools/gates.mjs contract slices
MERGE ORDER: 2nd (parallel with WP1, WP2); regenerate /exports after WP3 merges.

WORKER RULES: as in p2-wp0.md.
