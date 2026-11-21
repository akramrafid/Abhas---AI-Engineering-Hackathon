# Abhas brand kit (v1.0)

Source of truth for the app's look. Full 16-page guideline (exportable to PDF):
https://claude.ai/artifact/BkdcU9NNJwJkViHNa5pcb9

- **Name:** Abhas (আভাস), "an early sign; a hint of what is coming". It is the root of পূর্বাভাস (forecast).
  - Promise: *Rain today. Risk in three weeks. Act now.*
  - Bangla promise: আজ বৃষ্টি। তিন সপ্তাহ পরে ঝুঁকি। এখনই ব্যবস্থা নিন।
  - Descriptor: Dengue early warning, ward by ward · ওয়ার্ড-ভিত্তিক ডেঙ্গু আগাম সতর্কতা
- **Palette:**
  - Brand colours: Ink #0B0F14 (base) · Navy #0B1A5C (depth) · Royal #2F5BFF (primary) · Lime #D4F53C (the
    accent) · White.
  - Supporting neutrals: Slate #4B5578 · Mist #DDE3F3 · Paper #F4F6FD.
  - Royal does the work: logo, links, buttons, charts.
  - Lime is the spark. Use it once per view, only on Ink, Navy or Royal, and **never in data views**: it is
    too close to the Low and Medium risk colours.
- **Logo:** a raindrop cut by an A (Λ), which is also an arrow pointing up. The cap above the cut is Royal
  (Lime on dark grounds); the city below is Navy (White on dark grounds).
  - Files in `logo/`:
    - `abhas-mark.svg`: light grounds
    - `abhas-mark-reverse.svg`: Ink, Navy or Royal
    - `-mono-black` and `-mono-white`: one-colour use
    - `abhas-app-icon.svg`: app icon and favicon source
  - Wordmark: ABHAS in Manrope 800, uppercase, tracking 0.08em. Turn the text into outlines with opentype.js.
- **Tokens:** `tokens.json` → generate CSS variables and the Tailwind v4 `@theme` from it. Never hard-code hex.
- **Graphics:** `art/abhas-ribbon-*.svg` on Ink or Navy for covers, section pages and hero bands only. Never
  behind data.
- **Rules:**
  - Risk colours (Low → Critical, light → dark) are used only for risk. Every tier always shows its label
    and its 1–4 bar meter.
  - Fonts are self-hosted from @fontsource.
- **Voice:** name the ward and the time window first, then give one action. Show ranges, not promises.
  No capitals for emphasis, no exclamation marks.
