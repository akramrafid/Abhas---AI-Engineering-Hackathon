ROLE: CORE · Gemini 4 Neon (XHigh) · hat prove (fix, security)
LEAD_BRANCH: version-onsite-final   TASK: p2-fix-ratelimit-xff — stop X-Forwarded-For spoofing of the rate limit (QA Q1)
PRIORITY: P1 (MEDIUM, security)
SKILLS: production-hardening, security-review, receiving-code-review, verification-before-completion

## Problem
`apps/api/app/__main__.py:18` runs `uvicorn.run("app.main:app", host=…, port=…, reload=…)` with uvicorn's defaults,
`proxy_headers=True` and `forwarded_allow_ips="127.0.0.1"`. For any client connecting from 127.0.0.1, uvicorn's
ProxyHeadersMiddleware rewrites `scope["client"]` from `X-Forwarded-For` before the app runs. The project's own trusted
proxy logic (`RateLimitMiddleware._client_ip`, `apps/api/app/core/ratelimit.py:103`, `TRUSTED_PROXIES`) is therefore
bypassed.

Repro (QA lane A):
1. Send 125 × `GET /api/v1/plans?limit=1` to the API. The 121st and later return 429.
2. Send the same request with `X-Forwarded-For: 203.0.113.1`. It returns 200, and every forged IP gets a fresh quota.

## Owned paths
- `apps/api/app/__main__.py`
- Any Dockerfile or Render start command under `apps/api/` that starts uvicorn directly. Check the Dockerfile `CMD`
  and `render.yaml` if present.
- `apps/api/tests/test_security_hardening.py` (add the test)

## Expected behaviour
1. Uvicorn never rewrites the client address on its own. Pass `proxy_headers=False` in `__main__.py`, and add
   `--no-proxy-headers` to every uvicorn command line in the Dockerfile and deploy config.
2. The app's `TRUSTED_PROXIES` setting stays the only place that decides whether `X-Forwarded-For` is honoured. With
   it empty (the default), the peer address is used.
3. For the Render deploy, document in README "Deploy" that `TRUSTED_PROXIES` must list Render's proxy range, or
   per-user limits collapse into one bucket. Do not change the default.

## Tests that prove the fix
- `test_xff_spoof_does_not_reset_rate_limit`:
  - Start the real server with `python -m app --env test --port <free> --no-reload` (subprocess, like the existing
    port-in-use test), with `RATE_LIMIT_PER_MINUTE=5`.
  - Send 6 requests without XFF. The last returns 429.
  - Send 1 request with `X-Forwarded-For: 203.0.113.1`. It also returns **429**.
- The existing trusted-proxy unit tests in `test_security_hardening.py` stay green.

## Gate
`npm run ci` · `npm run redteam`. Commit as `version-onsite-final: fix(security): disable uvicorn proxy headers; app decides trust`.
