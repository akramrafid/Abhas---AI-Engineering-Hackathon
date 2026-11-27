ROLE: QA · Gemini 4 Neon (XHigh) · hat ship (docs)
LEAD_BRANCH: version-onsite-final   TASK: p2-fix-demo-script — make docs/demo-7min.md match what the app shows (QA demo mismatches)
PRIORITY: P1 (P6 video = 10 points; the take is one uncut run)
SKILLS: demo-docs, webapp-testing, verification-before-completion

## Problem
The exploratory QA lane followed `docs/demo-7min.md` click by click at `b4c2460`. These lines do not match the app:
1. **Scope.**
   - Step 1 says "select `Dhaka South`".
   - With that scope, step 2 solves 20 wards and step 3 shows one city card with 19 unroutable, not 5 cards and 61.
   - The narration later says "all 5 city pools" and "61 unroutable".
2. **Offline beat (5:40).**
   - Turning Wi-Fi off does not light the Offline badge. The badge follows only the API's `offline` flag, and the
     API runs on the same laptop.
   - `?demo=1` already shows "Demo mode · offline" while online.
3. **Figures.** Step 4: the band shows **48.6 – 112.5**, not 112.6, and beds avoided show **26.99**, not "27.0".
4. **Labels.** The button is **"Save as plan"**, not "Save Plan". **"Compare plans"** sits in the provenance strip, not
   inside Step 4.
5. **Route (2:40).** The narration says "61 unroutable" while the panel reads "all wards remain within bed capacity"
   (H2). After `p2-fix-route-demo` lands, the panel says "No free beds anywhere in …"; match the narration to it.
6. **Step 1 beds.** The narration says "21 beds needed for Ward 04". Ward 04's capacity is 7. After
   `p2-fix-beds-peak`, use the new peak-week number; until then say "21 bed-weeks over the 3-week window".

## Owned paths
- `docs/demo-7min.md`
- `docs/offline-drill.md` (the offline beat only)

## Expected behaviour
1. **Step 1:** keep scope **All cities**. Click DSCC_Ward_04 in the table for the ward-level numbers.
2. **Offline segment:**
   - Before recording, start the API with `ABHAS_OFFLINE=1` for the offline segment, or restart it on camera:
     `ABHAS_OFFLINE=1 npm run dev:api` takes about 8 s.
   - Show the Offline chip in the provenance strip and `"offline": true` in `/readyz`.
   - Then turn Wi-Fi off and show the app still working.
   - If `p2-fix-offline-honesty` adds a browser offline indicator, describe that instead.
3. **Figures:** quote the numbers exactly as the UI shows them (112.5, 26.99, or "about 27 beds").
4. **Labels:** use the exact UI labels.
5. **Pre-flight checklist at the top of the script:**
   - restart the API after the final commit;
   - check that `/readyz` `git_sha` equals `git rev-parse --short HEAD` and that `git status` is clean (P6 zeroes the
     video on a commit-hash mismatch);
   - use a clean database without e2e test plans, or delete `data/abhas.db` and run `npm run setup`;
   - pass `?lang=en` explicitly in the URL.
6. **Dry run:** after all P0/P1 fixes are merged, run the script once against the final build, with a stopwatch, and
   update every quoted number.

## Test that proves the fix
- A dry run by the OUTSIDER seat, or a QA re-run of lane C against `docs/demo-7min.md`, reports zero mismatches.

## Gate
Docs only. Commit as `version-onsite-final: docs(demo): align 7-min script with the app`.
