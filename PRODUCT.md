# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Public health officers** in Dhaka North, Dhaka South, Chattogram, Gazipur and Narayanganj city corporations.
  They plan larviciding, spraying, hospital beds, saline and test kits ward by ward, and today they act after cases spike.
- **Hackathon judges** (confirmed primary audience for the landing page): they watch a 3-minute uncut demo and score
  the rubric in TASK.md. They must understand the mechanism within seconds and see real model output.

## Product Purpose

Abhas (আভাস, "an early sign") turns this week's rain into a ward-level dengue risk forecast 1 to 4 weeks ahead, so
officers can target high-risk wards before the peak. Success: an officer names the ward and the time window and takes
one action.

## Positioning

The vector breeding clock: rain today shows up as hospital cases 2 to 4 weeks later. Abhas models that lag per ward
(trained LightGBM on 60 wards × 522 weeks) and adds each ward's own vulnerability (water-logging, density,
sanitation), so it says *which* ward surges and *when*, not just that the monsoon is coming.

## Operating Context

- Localhost app: FastAPI API + Next.js dashboard. Login with Clerk leads to the dashboard at `/dashboard`.
- Demo URL `/dashboard?demo=1` pins Dhaka South Ward 4, origin week 2024-08-05, offline dataset mode.
- Weather from the dataset by default; Open-Meteo live mode is optional.

## Capabilities and Constraints

- Tiers exactly Low, Medium, High, Critical. Every tier shows its label and 1–4 meter.
- Ward geometry is not in the dataset. Map positions are approximate, placed around real city centroids
  (`apps/api/config/city_centroids.json`) and must be labelled as approximate.
- Fresh clone must run in ≤ 3 minutes with zero keys (Clerk keyless dev mode covers login).
- Bilingual copy: English and Bangla.

## Brand Commitments

Binding: `docs/brand/BRAND.md` and `docs/brand/tokens.json` (palette Ink/Navy/Royal/Lime/White + Slate/Mist/Paper,
Manrope + IBM Plex Mono + Noto Sans Bengali, raindrop-Λ logo, ribbon art on Ink/Navy only, Lime once per view and
never in data views, risk colours only for risk). Voice: name the ward and the time window first, then one action;
ranges, not promises; no capitals for emphasis, no exclamation marks. Promise: *Rain today. Risk in three weeks. Act now.*

## Evidence on Hand

- Dataset facts (TASK.md): 31,320 rows, 60 wards, 2016-01-04 → 2025-12-29; deseasonalised rain→cases correlation
  0.03 (k=0), 0.07, 0.23, **0.47 (k=3)**, 0.33, ~0 (≥5).
- Model output and validation metrics from the running API (`/api/v1/heatmap`, `/api/v1/validation`).
- The data looks simulated; never claim real-world validity. No testimonials, customers or deployments exist; do not invent them.

## Product Principles

1. Lead time over accuracy theatre: show when a ward surges, with ranges.
2. Every number is traceable to the dataset or the model.
3. One action per view, ward first.
4. Runs on a laptop for free: cached weather, small model, optional LLM.

## Accessibility & Inclusion

WCAG 2.2 AA (axe in e2e). Bangla script rendered with Noto Sans Bengali. Risk never encoded by colour alone.
