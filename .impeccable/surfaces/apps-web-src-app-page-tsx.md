---
version: 1
slug: "apps-web-src-app-page-tsx"
primary_target: "apps/web/src/app/page.tsx"
related_targets: ["apps/web/src/features/landing"]
---

# Landing page (/)

Mode: Persuade. Audience: hackathon judges watching the demo; framed for city public health officers.
Action: open the dashboard (/dashboard?demo=1; Clerk sign-in when keys exist). Proof: live model output (map, Ward 4 forecast card with 80% range and drivers), lag correlation, locked hold-out MAE.
Constraints: Abhas Brand Guidelines PDF + docs/brand (binding); Lime once per view and never in data views; risk colours only for risk with label + meter; ribbons never behind data; map positions approximate and labelled; no invented claims; no capitals or exclamation marks.

## Direction contract

THESIS: A premium SaaS product page, the category canon played straight at Linear/Vercel craft, whose signature is the brand's own fine-line ribbon rendered live as rain curtains in wind; refuses the generic gradient-blob hero and icon-card rows.
OWN-WORLD: Ink and Navy grounds for hero, product tour and close; Paper/White for evidence and features (brand: charts on plain Paper or White). Royal does every working part; Lime only on "Act now." in the hero and the final CTA. Tints from the guideline ramps only. Manrope 800 headlines, 300 display promise, Plex Mono for every number, Noto Sans Bengali for Bangla. Ribbon canvas, Λ signal pattern at low contrast, sky/city shapes cropped by edges.
STORY: Visitor sees which wards will rise and when, watches one monsoon week play out on the real map, trusts the numbers (range, hold-out), sees the outputs officers get (dashboard card, SMS, field notice), opens the dashboard.
FIRST VIEWPORT: Ink ground, live ribbon canvas sweeping from the right edge. Left-aligned H1 "Know which wards will rise, three weeks before they do." (ExtraBold), promise line with "Act now." in Lime, body sentence, Royal primary "Open the dashboard" + ghost "Watch one monsoon week". Below the fold line a framed product window (live map + Ward 4 forecast card) rises with a 3D tilt that flattens on scroll.
FORM: SaaS canon (standing exit, user-chosen: "look like a SaaS website"), reference craft bar Linear / Vercel, seed: none (pinned). Signature interaction: GSAP-pinned rain clock scrubbed by scroll; ribbon canvas drift; SplitText headline reveal; product window flatten.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
