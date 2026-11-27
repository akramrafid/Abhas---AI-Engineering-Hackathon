# Abhas Phase 2 — Offline Drill & Verification Record (ADR-0015)

**Branch:** `version-onsite-final`  
**Verified Commit (code):** `96f982d` (post-QA hardening: browser `navigator.onLine` badge, zero browser-side Open-Meteo fetches, unconditional 5-step Command Center walk + Weather layer offline check, CSP-hardened A4 brief)  
**Model Version:** `abhas-lgbm-1.1.2` · **Data as of:** `2025-12-29`

---

## 1. Automated Offline Gate Proof (`npm run offline:check` / `gates.mjs offline`)

Executed end-to-end with `ABHAS_OFFLINE=1` and `NEXT_PUBLIC_ABHAS_OFFLINE=1` enforcing both a Python non-loopback `socket.socket.connect` monkeypatch guard (API) and Playwright `page.route("**/*")` non-localhost abort (`internetdisconnected`) (Web):

| Layer | Suite | Command | Result | External Calls | Console / Page Errors |
|---|---|---|---:|---:|---:|
| **API (`-m offline`)** | Offline resilience & socket-guard tests | `ABHAS_OFFLINE=1 uv run pytest -q -m offline` | **10 / 10 PASS** | **0** | N/A |
| **API (full suite)** | Every unit, property, contract, security, and slice test under socket guard | `ABHAS_OFFLINE=1 uv run pytest -q` | **223 / 223 PASS** | **0** | N/A |
| **Web (Landing)** | Self-hosted fonts/icons/portraits + Rain Clock GeoJSON fallback | `playwright test --project=offline` (test 1) | **PASS** | **0** | **0** |
| **Web (Risk Map)** | Dashboard MapLibre offline GeoJSON schematic + Weather layer ON + ward selection | `playwright test --project=offline` (test 2) | **PASS** | **0** | **0** |
| **Web (5-Step Command Center)** | Unconditional walk of all 5 Command Center steps + offline chips + Plans save/compare + CSP-hardened A4 brief | `playwright test --project=offline` (test 3) | **PASS** | **0** | **0** |

---

## 2. Module-by-Module Offline Walkthrough (All 5 Operational Modules)

Every request below ran against local `http://127.0.0.1` with `ABHAS_OFFLINE=1`, zero external internet traffic, and `"offline": true` verified in every JSON response and brief footer:

| Step | Module & Endpoint | Verification Action | HTTP | `offline` | Observed Result |
|---|---|---|---:|---:|---|
| **0** | Readiness `GET /readyz` | Deep check: SQLite seeded + LightGBM SHA-256 + `supply_ratios.json` + `ward_capacity.json` | `200` | `true` | All 4 readiness checks `true`; zero network calls |
| **1** | **Forecast** (`command-step-1`, `POST /api/v1/forecast`) | `DSCC_Ward_04`, `origin_week=2024-08-05`, horizons `2, 3, 4` | `200` | `true` | Local LightGBM CPU inference (`5.0 ms`), P10–P90 conformal band + TreeSHAP |
| **2** | **Allocation** (`command-step-2`, `POST /api/v1/allocation/plan`) | `scope=Dhaka South`, `stock_pct=60`, `equity_floor_pct=20`, `total_crews=10` | `200` | `true` | Exact conservation (`1243/2072` saline, `608/1013` kits, `89/148` peak-week beds), ceiling 20% equity floor intact, 13 critical deficit wards |
| **3** | **Overflow Routing** (`command-step-3`, `POST /api/v1/overflow/route`) | `scope=Dhaka North`, `horizon=3`, `service_level=0.9` | `200` | `true` | Intra-city HiGHS MILP (`12.6 ms` warm), zero cross-city transfers, `21` patients without a bed reported honestly |
| **4** | **Counterfactual Simulator** (`command-step-4`, `POST /api/v1/simulator/run`) | `auto_crews=10`, `efficacy=base`, `origin_week=2024-08-05` | `200` | `true` | `90.56` cases prevented (`[48.61–112.55]` Low–High band), `26.99` beds & `215.99` saline avoided, ROI ranked |
| **5** | **Dispatch & Plans** (`command-step-5`, `POST /api/v1/dispatch/notices`, `GET /api/v1/dispatch/brief/DSCC_Ward_04.html`, `POST /api/v1/plans`, `GET /api/v1/plans/compare`) | Bangla (`lang=bn`) SMS/WhatsApp + A4 HTML brief + Save Plan A/B + Compare Plans | `200` / `201` | `true` | UCS-2 Bangla SMS (`2–3 seg`), CSP-hardened zero-URL A4 brief (`offline=true` in footer), append-only plan comparison (`6+` metric diffs) |

---

## 3. Physical Wi-Fi Disconnect Verification & Stage Drill Protocol

> **Honesty note:** Because this automated integration environment runs inside a sandboxed workstation where the AI agent does not toggle the host OS's physical Wi-Fi radio, automated proof above used strict OS-level Python socket blocking (`socket.socket.connect` failing any non-loopback host) plus Chromium `page.route("**/*")` aborting every non-localhost URL (`net::ERR_INTERNET_DISCONNECTED`). **Before judging**, the human presenter must run the 2-minute physical Wi-Fi drill below on the presentation laptop and check off the sign-off box.

### Physical Wi-Fi Disconnect Checklist (Run Once Before Judging + Live at 5:40 of Demo)
1. Start local stack: `npm run dev` (or for immediate `/readyz` `"offline": true`, launch the API with `ABHAS_OFFLINE=1 npm run dev:api` — takes ~8 s).
2. Open `http://localhost:3000/dashboard?demo=1&tab=command&lang=en` and verify `ProvenanceStrip` shows `SHA` matching `git rev-parse --short HEAD` and `Local API` while online.
3. **Physically disconnect Wi-Fi / enable Airplane Mode** on the presentation laptop.
4. Confirm the **`Offline (network)`** badge lights up **immediately** in both the Phase 1 header and `ProvenanceStrip` (driven by `navigator.onLine` + `offline` window event), and `Live Open-Meteo` disables with tooltip `"Offline — dataset weather"`. Within ≤ 30 s (or immediately under `ABHAS_OFFLINE=1`), `/readyz` also flips `"offline": true`.
5. Click through all 5 modules while disconnected:
   - [ ] **Step 1 (Forecast):** switch scope `all` → `Dhaka South` — forecast table updates with zero errors.
   - [ ] **Step 2 (Allocate):** drag **Available Regional Stock** slider `100%` → `60%` → `45%` — allocations & deficit badges re-solve live in < 200 ms.
   - [ ] **Step 3 (Route):** verify city cards (`Beds filled after`, `Demand / capacity`, `patients without a bed`), click **`Shoulder week (12 Aug)`** or edit a ward capacity override — transfers re-compute cleanly.
   - [ ] **Step 4 (Simulate):** toggle `Auto-place N crews` (`10` crews) and `Low / Base / High` presets — ROI table and `[48.6 – 112.5]` sensitivity band update cleanly.
   - [ ] **Step 5 (Dispatch):** toggle `English (GSM-7)` ↔ `বাংলা (UCS-2)`, click **`Open printable brief`**, confirm self-contained A4 HTML renders with zero broken assets and CSP header intact.
6. Re-enable Wi-Fi and confirm the header and provenance strip recover cleanly back to `Local API` without reload.
