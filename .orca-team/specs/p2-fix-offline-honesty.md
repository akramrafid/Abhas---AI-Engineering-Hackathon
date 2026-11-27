ROLE: UI + QA · Gemini 4 Neon (XHigh) · hat prove (fix)
LEAD_BRANCH: version-onsite-final   TASK: p2-fix-offline-honesty — no browser-side bypass; offline e2e must really walk the UI (review M2, M3)
PRIORITY: P2 (MEDIUM; rubric P4 = 15 points)
SKILLS: production-hardening, frontend-engineering, webapp-testing, verification-before-completion

## Problems
- **M2.** `apps/web/src/features/risk-map/components/RiskMapView.tsx:172-199` fetches
  `https://api.open-meteo.com/v1/forecast` straight from the browser when the "Weather now" layer is on.
  - It ignores `NEXT_PUBLIC_ABHAS_OFFLINE`, so offline it fails and logs a console error.
  - It bypasses the API's cache and circuit breaker, which contradicts the cost controls in ARCHITECTURE.md.
  - It also contradicts `README.md:144`, which says the kill switch short-circuits Open-Meteo.
- **M3.** `apps/web/e2e/offline.spec.ts:169-176` walks the Command Center only `if (count() > 0)`, waits 200 ms per
  step, and asserts nothing. It passes when the tab is missing or a step shows an error state.

## Owned paths
- `apps/web/src/features/risk-map/components/RiskMapView.tsx`
- `apps/web/src/lib/api/**` (client hook only, if needed)
- `apps/web/e2e/offline.spec.ts`

## Expected behaviour
1. **"Weather now" layer.** It never calls a third-party host from the browser. It uses the existing API weather
   status (`useWeatherStatusQuery`, or the API's live-weather endpoint if one exists) and nothing else.
   - When `NEXT_PUBLIC_ABHAS_OFFLINE=1`, or the API reports `offline: true`, the layer shows "Offline — dataset
     weather" in EN and BN.
   - If no API endpoint exposes current readings, remove the live fetch and show the cached or dataset label only.
2. **Offline Command Center walk.** After WP5 is merged, the walk is unconditional:
   - `expect(page.getByTestId("tab-command")).toBeVisible()`;
   - for each step 1–5, click `command-step-N`, then assert that step's main data test ID is visible (the allocation
     table, the route city cards, the ROI table, the SMS preview);
   - assert that no `[role="alert"]` error card is visible.
3. Add one assertion that the `offline` badge is visible on the provenance strip under
   `NEXT_PUBLIC_ABHAS_OFFLINE=1`.
4. **QA Q7.** The Offline chip must also react to the browser.
   - Combine the API's `offline` flag with `navigator.onLine` and the `online` / `offline` window events.
   - Label the states:
     - "Offline (network)" when the browser is offline;
     - "Offline mode" when the API says offline;
     - otherwise "Local API".
   - `?demo=1` must not show "offline" while online. Rename that chip to "Demo data".
5. **QA Q7, Phase 1 dashboard.**
   - When `NEXT_PUBLIC_ABHAS_OFFLINE=1`, or the API reports offline, disable the "Live Open-Meteo" toggle with the
     tooltip "Offline — dataset weather".
   - Show the same Offline chip in the Phase 1 header.

## Tests that prove the fix
- `grep -rn "api.open-meteo.com" apps/web/src` returns nothing; display-only links in the About text are allowed.
- `npm run test:offline:web` passes with the stricter walk. Temporarily remove the Command tab locally to confirm
  the test now fails without it; do not commit that change.
- A new e2e check: with every non-localhost request aborted and the Weather layer on, there are zero console errors.

## Gate
`npm run offline:check` · `node .orca-team/tools/gates.mjs e2e`.
Commit as `version-onsite-final: fix(offline): route weather via API, assert every Command step offline`.
