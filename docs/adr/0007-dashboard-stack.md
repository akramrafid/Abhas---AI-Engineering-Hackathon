# ADR-0007: Next.js 16 dashboard with client-side fetching via a typed OpenAPI client
## Status
Accepted · 2026-11-21
## Context
R4 wants intuitive inputs and a clear driver breakdown; the brand kit (tokens, fonts, logo) must be applied.
The UI reads a local API; interactions (pickers, sliders) need instant feedback.
## Decision
Next.js 16 App Router, TypeScript strict, Tailwind v4 with `@theme` generated from `docs/brand/tokens.json`,
shadcn/ui primitives, Recharts, TanStack Query for client-side fetching and caching, `openapi-typescript` +
`openapi-fetch` types generated from `contracts/openapi.json`. Fonts self-hosted with @fontsource (Manrope,
IBM Plex Mono, Noto Sans Bengali). Every tier shows its EN/BN label and a 1–4 meter.
## Rejected options
- **Streamlit / Gradio** — quick, but no custom brand, weak control of accessibility and interaction.
- **Server components fetching the API at render** — couples the web server to API availability on every
  request; slider interactions need client state anyway.
## Consequences
One typed contract for UI, tests and Schemathesis. `next build` time adds to setup only if used; dev server
compiles on first request.
