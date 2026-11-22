ROLE: REVIEWER-SEC
LEAD_BRANCH: lead
TASK: r1-security-lead — Security review of LEAD-written code (Claude Opus authored it; you are the other family)
SKILLS: security-review, ai-red-team (threat-model part only), differential-review, semgrep, supply-chain-risk-auditor
SCOPE (read-only): apps/api/app/core/** · apps/api/app/ports/** · apps/api/app/main.py · apps/api/app/export_openapi.py ·
  apps/api/app/features/*/schemas.py · apps/api/app/features/ops/router.py · scripts/setup.mjs · scripts/py.mjs ·
  scripts/smoke.mjs · package.json · apps/api/pyproject.toml · apps/api/requirements.txt · .env.example.
FOCUS: input validation at the trust boundary (ward_id, origin_week, horizons, scenario weather ranges, list
  sizes) · problem+json never leaks internals or secrets · rate limit bypass (per-IP key, X-Forwarded-For) ·
  CORS · ops token compare (timing-safe, open-when-unset only on localhost) · setup scripts with shell=True on
  Windows (argument injection) · dependency risks (pinning, known CVEs: run `uvx pip-audit -r apps/api/requirements.txt`
  and `npm audit --omit=dev` in apps/web) · secrets in logs.
REPORT: .orca-team/reviews/r1-security-lead.md (only file you may write); title line contains
  "reviewer: antigravity/Gemini 4 Neon (XHigh)". Severity BLOCKER/HIGH/MEDIUM/LOW · file:line · why · concrete fix ·
  verdict SHIP / FIX-BLOCKERS / REWORK. Max 15 findings. Commit on your branch ("docs(review): r1 security of LEAD
  code"), then worker_done with the verdict and counts per severity. Do not edit any code.
Time box: 30 minutes.
