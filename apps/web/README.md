# Abhas Web Console (`apps/web`)

Next.js 16 (App Router + Turbopack + Tailwind CSS v4) bilingual operations console and public portal for **Abhas (আভাস)**.

---

## Highlights

- **Full Bilingual Localization (`EN ↔ বাংলা`):** Every landing section, navigation item, auth control, dashboard view, ward brief, and Abhas AI chat drawer switches cleanly between English and Bangla (`Noto Sans Bengali`), persisted across routes via `localStorage("abhas-lang")`.
- **Responsive Phone, Tablet & Desktop Ergonomics:** Mobile bottom view dock, sticky-safe `overflow-x: clip`, touch-friendly segmented controls, and zero chat/dock overlap on small screens (`360px` to `1440px+`).
- **Offline-Bundled Brand Assets:** Self-hosted **Poppins** + **Noto Sans Bengali** (`@fontsource`) and offline-extracted **Solar Bold Duotone** icons (`src/components/icons/`). Zero runtime CDN dependency for fonts or icons.
- **Live Open-Meteo Toggle:** Switch directly between offline historical dataset mode (`2016–2025`) and real-time Open-Meteo Bangladesh forecasts (`Asia/Dhaka` current week) from the dashboard header.
- **Grounded Streaming AI Copilot:** Global liquid-glass `AbhasChatWidget` (`Ctrl+/`) streaming from `/api/v1/chat/stream` with active ward/origin context.
- **Optional Clerk Sign-In:** When `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` are configured in `apps/web/.env.local`, `src/proxy.ts` gates `/dashboard(.*)` behind `/sign-in` and the dashboard brand logo opens a bilingual logout confirmation modal. When omitted, `/dashboard` opens directly for zero-key evaluation.

## Directory Structure

```text
apps/web/src/
├── app/                     # Next.js App Router pages (/, /dashboard, /docs, /security, /status, /contact, /about, /brand, /privacy, /terms, /sign-in, /sign-up, /api/ops)
├── components/              # Shared brand, dashboard shell, auth, ward-map, offline Solar icons & UI primitives
├── features/                # 11 isolated frontend slices:
│   ├── landing/             # Hero, RainClock, HowItWorks, Outputs, ProofSection, IntegrationsAndTrust, TestimonialsSection, PilotSection, CostAndClose, Faq
│   ├── ward-risk/           # Flagship Ward Forecast console (WardRailList, PeakTierCard, ForecastChart, HorizonTable, DriversList, AdvisoryCard)
│   ├── risk-map/            # Interactive 60-ward MapLibre GL map
│   ├── lags/                # Multi-week rainfall lag correlation explorer
│   ├── scenario/            # Counterfactual what-if weather simulator
│   ├── heatmap/             # City ward × horizon risk matrix
│   ├── priority/            # Worst-first dispatch queue + formula-safe CSV export
│   ├── validation/          # Locked 2024–2025 hold-out validation dashboard
│   ├── about/               # Compute & cost transparency view
│   ├── chat/                # Grounded streaming Abhas AI widget
│   └── brand/               # Brand guidelines & WCAG contrast audit showcase
├── lib/                     # OpenAPI-typed API client, i18n dictionary, date & CSV helpers
└── styles/tokens.css        # Generated design tokens from docs/brand/tokens.json
```

## Local Commands

Run from `apps/web` (or via root `package.json`):

```bash
# Development server (http://localhost:3000)
npm run dev

# Regenerate TypeScript schema from contracts/openapi.json
npm run api:types

# Regenerate Solar Bold Duotone icon bundle
node scripts/extract-solar-icons.mjs

# Typecheck, lint & production build
npm run typecheck
npm run lint
npm run build

# Playwright E2E + axe WCAG 2.2 AA accessibility suite
npm run e2e
```
