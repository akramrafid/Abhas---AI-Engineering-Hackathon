---
name: Abhas
description: Dengue early warning, ward by ward. Rain today. Risk in three weeks. Act now.
colors:
  ink: "#0B0F14"
  navy: "#0B1A5C"
  royal: "#2F5BFF"
  lime: "#D4F53C"
  white: "#FFFFFF"
  slate: "#4B5578"
  mist: "#DDE3F3"
  paper: "#F4F6FD"
  risk-low: "#BFE3CC"
  risk-low-on: "#16202B"
  risk-low-border: "#9FCBB0"
  risk-medium: "#F0B429"
  risk-medium-on: "#16202B"
  risk-high: "#C2410C"
  risk-high-on: "#FFFFFF"
  risk-critical: "#7F1D1D"
  risk-critical-on: "#FFFFFF"
  forecast-band: "rgba(47,91,255,0.15)"
typography:
  display:
    fontFamily: "Manrope, Noto Sans Bengali, system-ui, sans-serif"
    fontSize: "48px"
    fontWeight: 300
    lineHeight: "52px"
  h1:
    fontFamily: "Manrope, Noto Sans Bengali, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: "40px"
  h2:
    fontFamily: "Manrope, Noto Sans Bengali, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: "32px"
  body:
    fontFamily: "Manrope, Noto Sans Bengali, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "24px"
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
    fontFeature: "\"tnum\" 1"
  caption:
    fontFamily: "Manrope, Noto Sans Bengali, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "16px"
  bangla:
    fontFamily: "Noto Sans Bengali, sans-serif"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
  "7": "48px"
  "8": "64px"
components:
  button-spark:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 24px"
    height: "48px"
  button-primary:
    backgroundColor: "{colors.royal}"
    textColor: "{colors.white}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.navy}"
  button-ghost-dark:
    textColor: "{colors.white}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "48px"
  chip-segment:
    backgroundColor: "{colors.white}"
    textColor: "{colors.navy}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  chip-segment-selected:
    backgroundColor: "{colors.royal}"
    textColor: "{colors.white}"
  card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px 20px"
  tooltip-map:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "12px"
    width: "224px"
  panel-on-map:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.mist}"
    rounded: "{rounded.lg}"
    padding: "12px"
  risk-badge-low:
    backgroundColor: "{colors.risk-low}"
    textColor: "{colors.risk-low-on}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  risk-badge-medium:
    backgroundColor: "{colors.risk-medium}"
    textColor: "{colors.risk-medium-on}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  risk-badge-high:
    backgroundColor: "{colors.risk-high}"
    textColor: "{colors.risk-high-on}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  risk-badge-critical:
    backgroundColor: "{colors.risk-critical}"
    textColor: "{colors.risk-critical-on}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
---

# Design System: Abhas

## Overview

**Creative North Star: "The Night Map Before the Rain Clock"**

Abhas is a public-health instrument dressed in the Abhas brand kit (`docs/brand/BRAND.md`, `docs/brand/tokens.json`; tokens generated into `apps/web/src/styles/tokens.css`, never hand-edited). Its ground is Ink and Navy: an inverted, colour-drained OpenStreetMap night map of 60 wards on which risk glows in four tier colours. Royal does every working job (links, buttons, selected states, the focused ward's halo, rain ripples, charts). Lime is a single spark per view, on a dark ground, on the one action that matters.

Two grounds share the work. Ink/Navy owns the story moments: the landing hero, the pinned rain-clock map, the closing band, the auth split screen and the dashboard header. Paper and White own the reading and working moments: evidence charts, tables, cards, the dashboard body and Clerk's form. Density is calm: light 300-weight display type, generous section padding on the landing, compact 12-14px controls in the dashboard.

Measured values speak in IBM Plex Mono with tabular numerals (week stamps, mm of rain, expected cases, MAE). Bangla is a first-class voice, set in Noto Sans Bengali next to every English promise and tier label.

**Key Characteristics:**
- Ink night map as the hero surface; wards are glowing dots, never polygons.
- Royal for every interactive part; Lime once per view, never in data views.
- Risk tiers in their own four colours, always with label (EN and BN) and a 1-4 bar meter.
- Manrope 300 display against Manrope 700/800 emphasis; Plex Mono for numbers.
- Depth by tone and a hairline white ring on dark panels; one real shadow, on the light map tooltip.

## Colors

A dark brand ground with one working blue, one rationed spark, a cool neutral ladder, and a risk scale reserved for risk.

### Primary
- **Royal Signal** (royal): links, primary buttons, selected tabs (2px underline), selected segment chips, the global focus outline, the focused ward's outer halo, rain ripples, chart strokes, Clerk's primary colour.

### Secondary
- **Ink Night** (ink): the map ground, landing hero, rain-clock panels, auth split screen; the body text colour on light grounds.
- **Navy Depth** (navy): card titles and headings on light grounds, dashboard header buttons, the hover state of primary buttons.

### Tertiary
- **Lime Spark** (lime): the landing's primary call to action (hero and closing band, each in its own viewport), the logo's cap on dark grounds, and Lime-on-dark demonstrations on the /brand page.

### Neutral
- **White** (white): cards, the map tooltip, Clerk's card, text on Ink/Navy/Royal, the faint rim on every ward dot.
- **Paper** (paper): the page background (`body`) and light landing sections.
- **Mist** (mist): card borders and dividers on light grounds; secondary text on Ink.
- **Slate** (slate): secondary and caption text on light grounds.
- **Forecast Band** (forecast-band): translucent Royal fill for forecast confidence bands on charts.

### Risk scale (light to dark)
- **Low** (risk-low, on risk-low-on, bordered risk-low-border), **Medium** (risk-medium), **High** (risk-high), **Critical** (risk-critical). Each tier has its own on-colour for text; WebGL map paint reads them from the CSS variables at runtime.

### Named Rules
**The Lime Spark Rule.** Lime appears at most once per view, only on Ink, Navy or Royal, and never in a data view: it sits too close to Low and Medium.

**The Risk Is Only Risk Rule.** The four tier colours mean risk and nothing else. Every tier always shows its label and its 1-4 bar meter, so colour is never the only signal.

**The Token Source Rule.** Colours come from `tokens.json` through the generated CSS variables. No hex in components; map paint resolves `--color-*` at runtime.

## Typography

**Display Font:** Manrope (with Noto Sans Bengali, system-ui)
**Body Font:** Manrope (self-hosted via @fontsource, weights 300-800)
**Label/Mono Font:** IBM Plex Mono (400/500/600) for measured values; Noto Sans Bengali (400/600/700) for Bangla

**Character:** A light, wide geometric sans that whispers its headlines at 300 and lands one phrase at 800, paired with a plain mono that makes every number look measured.

### Hierarchy
- **Display** (300, 48px / 52px token; landing heroes run fluid `clamp(2.25rem, 5.4vw, 5rem)`, line-height 1.02, tracking -0.03em): landing hero, closing band, auth headline. One phrase may step to 800 ("Act now.").
- **Section headline** (300, `clamp(2rem, 4vw, 3.25rem)`, line-height 1.08, tracking -0.025em): landing section headings on Paper/White.
- **H1 / H2** (700, 32px/40px and 24px/32px): app headings; rain-clock step titles at 24px bold, tracking -0.02em.
- **Title** (700, 16px, Navy): card titles.
- **Body** (400, 15px / 24px): running text; landing lede at 18px / 32px, max ~34rem.
- **Data** (Plex Mono 500, 14px / 20px, tabular numerals via `.tnum`): values, dates, week stamps; 12px mono for stamps and table headers.
- **Caption** (500, 12px / 16px): legends, chip labels, helper notes; 11px only for the map's approximation note.

### Named Rules
**The Measured Mono Rule.** Every number a health officer might act on (dates, mm, cases, MAE, week offsets) is Plex Mono with tabular numerals.

**The Two Scripts Rule.** Bangla sits beside English, not behind a toggle only: the promise line and every tier label carry both, Bangla set in Noto Sans Bengali.

## Layout

The landing is full-bleed bands: the hero and rain clock pin a full-viewport Ink map with copy in the left third (`reserveForCopy` pads the camera), a week rail at right on large screens, the legend bottom-right and the week stamp bottom-left. Content bands below use max widths of 6xl-7xl with side padding 16px / 32px / 56px (mobile / sm / lg) and roughly 96px vertical rhythm. The dashboard is a card stack on Paper; the risk map card splits into map plus a 21rem ward ledger on large screens and stacks below that. The map height is `clamp(22rem, 60vh, 36rem)`. The auth screen is a two-column grid (1.1fr / 1fr) on lg, single column below.

Spacing follows the 4px token ladder (4, 8, 12, 16, 24, 32, 48, 64). Touch targets: primary actions 48px tall, header actions 40px, tabs 44px, chips 32px minimum.

## Elevation & Depth

Depth is mostly tonal. On dark grounds, panels are translucent Ink (80-90%) with a 1px white ring at 10% opacity; on light grounds, cards are White on Paper with a Mist border and no shadow. The one lifted surface is the map tooltip, a White card floating over the night map.

### Shadow Vocabulary
- **Dark-panel ring** (`box-shadow: 0 0 0 1px rgb(255 255 255 / 0.1)`): legends, rain-clock text panels, week rail on the map.
- **Tooltip lift** (Tailwind `shadow-xl` tinted Ink at 40%): the light ward tooltip over the map only.
- **Ward glow** (map paint: tier colour at 2.1x radius, opacity 0.22, blur 1): the soft halo under each ward dot.

### Named Rules
**The Tone Before Shadow Rule.** Separate surfaces with ground colour and hairline rings; reserve a cast shadow for the light tooltip that floats above the dark map.

## Shapes

Gently rounded and consistent: 6px for small chips (language toggle), 10px for buttons, badges and segment chips, 14px for cards, map frames, the tooltip and rain-clock panels; full pills only for dots. Risk-meter bars are tiny 1px-rounded rectangles (filled for active steps, outlined at 60% for inactive). Ward markers are circles whose area follows expected cases.

## Components

### Buttons
- **Shape:** gently rounded (10px).
- **Spark (landing only):** Lime fill, Ink text, bold (700) 16px, 48px tall, 24px side padding; hover lifts 2px over 200ms and the trailing arrow nudges right.
- **Primary:** Royal fill, White text, 14px semibold, 40px tall; hover goes Navy (on light) or inverts to White with Royal text (in the dark nav).
- **Ghost on dark:** White text, 1px white ring at 25%, hover fills White at 10%.
- **Focus:** global 2px Royal outline, 2px offset.

### Chips
- **Segmented choices:** White fill, Mist border, Navy text, 12px semibold, 32px tall; selected is Royal fill with White text. Numeric options set in Plex Mono with tabular numerals.
- **Language toggle:** 6px radius, Mist text on dark; selected Royal.

### Cards / Containers
- **Corner Style:** 14px.
- **Background:** White on Paper, Mist 1px border, no shadow.
- **Internal Padding:** 16px vertical, 20px horizontal; header separated by a Mist rule.

### Navigation
- **Landing nav:** absolute over the map, Ink-to-transparent gradient, reverse logo with Bangla, Mist links at 14px turning White on hover.
- **Dashboard tabs:** 44px tall, 14px, Slate text; selected is Navy semibold with a 2px Royal underline; arrow, Home and End keys move between tabs.

### Risk Tier Badge (signature)
Tier colour fill with its on-colour text, 10px radius, 1px border, semibold. A 4-bar ascending meter (filled to the tier's level 1-4, with an aria label "Risk level n of 4") precedes the label, which reads English / Bangla (order swaps in Bangla mode). Optional action line below. Sizes sm / md / lg.

### Ward Risk Map (signature)
- **Basemap:** OSM raster tiles inverted (brightness min 1, max 0), hue rotated 180, saturation -0.75, contrast 0.15, at 50% opacity over an Ink background. Raster only, so the Ink ground and wards still draw with no tile access.
- **Wards:** tier-coloured circles with a White rim at 45% opacity and a soft tier glow. Radius 3.5-11.5px by square root of expected cases relative to the wards on screen (min to max in view); 7px when the spread is under 0.5; 5px in rain mode.
- **Focused ward:** White 2px ring at radius +7 inside a Royal 3px halo at radius +10.
- **Rain mode:** staggered Royal ripples (1.5px stroke, radius 5 to 21px, fading from 85%) on a 2.2s cycle.
- **Legend:** bottom-right on Ink at 85% with the dark-panel ring; tier badges in Critical-to-Low order, a dot-size note, and the line "Ward positions are approximate: the dataset has no ward boundaries." The dashboard repeats tier counts and the approximation note under the map.
- **Attribution:** MapLibre compact control with OSM credit; attribution links underlined.
- **Tooltip:** White, 14px radius, 224px wide, tooltip lift shadow; flips below the cursor within 150px of the top edge; shows ward, tier badge, expected cases and target week in mono.

### Auth Shell
Ink split screen: ribbon art, reverse logo, 300-weight headline and Bangla promise on the left; Paper column with Clerk's card on the right. Clerk takes the tokens (Royal primary, Ink text, Slate muted, White card and inputs, Mist border, Manrope, 10px radius).

### Motion
- **Tier cross-fade:** ward colour and radius tween over 700ms with ease-out cubic between rain-clock steps and data changes.
- **Camera:** fits each step's view over 1600ms.
- **Micro:** 200ms transforms on the spark button; colour transitions on links and tabs.
- **Reduced motion:** a global rule cuts CSS animations and transitions to 0.01ms; the map snaps colours, skips ripples and moves the camera instantly.

## Do's and Don'ts

### Do:
- **Do** take every colour from the generated `--color-*` tokens; regenerate `tokens.css` from `tokens.json` instead of editing it.
- **Do** use Royal for every link, button, selected state, focus outline and chart line.
- **Do** keep Lime to one spark per view, on Ink, Navy or Royal, on the primary action.
- **Do** show tier label (English and Bangla) and the 1-4 bar meter wherever a tier colour appears.
- **Do** set measured values in IBM Plex Mono with tabular numerals.
- **Do** label ward positions as approximate on every map and keep the OSM attribution visible.
- **Do** size ward dots relative to the wards in view, so a monsoon peak of all-Critical wards still reads.
- **Do** give every motion a reduced-motion path that snaps to the end state.

### Don't:
- **Don't** use Lime in data views, on light grounds, or twice in one viewport.
- **Don't** use tier colours for anything other than risk, including errors, success states or decoration.
- **Don't** put ribbon art behind data; it belongs to hero bands, covers and the auth screen.
- **Don't** draw ward polygons or imply exact boundaries; the dataset has none.
- **Don't** add cast shadows to cards on light grounds; separate with Mist borders and tone.
- **Don't** use capitals or exclamation marks for emphasis.
