---
version: 1
slug: "apps-web-src-app-page-tsx"
primary_target: "apps/web/src/app/page.tsx"
related_targets: ["apps/web/src/features/landing"]
---

# Landing page (/)

Mode: Persuade. Audience: hackathon judges watching the demo; framed for city public health officers.
Action: sign in (Clerk) and open the ward dashboard at /dashboard. Proof: model output on the map, lag correlation, validation MAE from the API.
Constraints: brand kit binding; Lime once per view, never in data views; risk colours only for risk with label + meter; map positions approximate and labelled; no invented claims.

## Direction contract

THESIS: The page is the rain clock. One pinned map of 60 wards steps from rain week to +3 weeks as you scroll, so the 2-to-4-week lag is watched, not read. Refuses the split hero with a screenshot and a row of feature cards.
OWN-WORLD: Ink and Navy ground, Royal for every working part (links, buttons, focused ward ring), Lime spark only on the primary action in the hero. Risk tiers in their own colours with 1-4 meters. Manrope 800 wordmark, Manrope 300 display, IBM Plex Mono for week stamps and measured values. Ribbon art as the hero band's edge only.
STORY: Visitor understands rain today becomes cases in three weeks, believes Abhas knows which ward and when because the map shows it for a real week, and signs in.
FIRST VIEWPORT: Full-bleed Ink map of Dhaka region filling the viewport, ward markers glowing by tier. Top-left: logo and nav. Left third over the map: display headline "Rain today. Risk in three weeks.", Bangla line, one sentence, primary action "Sign in to the dashboard" (Lime on Ink) plus secondary "Watch the demo week". Bottom: week scrubber stamp "2024-08-05 · rain week".
FORM: Rain clock scrollytelling map, position 7 of 7 on my list, seed:c24b06273e2ac4ff. Signature interaction: scroll-driven week steps recolour the pinned map; hover a ward shows its tier, expected cases range and window.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Adaptations (recorded after finish review r1)
- Focused ward: white ring for contrast on Critical red, inside a Royal halo (OWN-WORLD Royal kept as the outer mark).
- Evidence, How it works and Cost sit on Paper/White: BRAND.md lists Paper as the supporting neutral and Royal for charts; charts and tables read better on a light ground. Ink/Navy own the hero, rain clock and closing band.
- Primary CTA reads "Open the dashboard": sign-in only appears when Clerk keys exist, so the label stays true in both modes.
- Dot size is relative to the wards on screen (in-view min to max of expected cases), because in a monsoon peak every ward can be Critical.
