# Abhas Phase 2 — Offline Drill & Verification Record (ADR-0015)

**Branch:** `version-onsite-final`  
**Verified Commit (code):** `eb12315` (full offline gate verified at `47f9dc8`; `e2e` including all 3 offline tests re-verified at `512e28b`; `ci` + `exports` re-verified at `eb12315`)  
**Model Version:** `abhas-lgbm-1.1.2` · **Data as of:** `2025-12-29`

---

## 1. Automated Offline Gate Proof (`npm run offline:check` / `gates.mjs offline`)

Executed end-to-end with `ABHAS_OFFLINE=1` and `NEXT_PUBLIC_ABHAS_OFFLINE=1` enforcing both a Python non-loopback `socket.socket.connect` monkeypatch guard (API) and Playwright `page.route("**/*")` non-localhost abort (`internetdisconnected`) (Web):

| Layer | Suite | Command | Result | External Calls | Console / Page Errors |
|---|---|---|---:|---:|---:|
| **API (`-m offline`)** | Offline resilience & socket-guard tests | `ABHAS_OFFLINE=1 uv run pytest -q -m offline` | **10 / 10 PASS** (9.62 s) | **0** | N/A |
| **API (full suite)** | Every unit, property, contract, security, and slice test under socket guard | `ABHAS_OFFLINE=1 uv run pytest -q` | **211 / 211 PASS** (61.54 s) | **0** | N/A |
| **Web (Landing)** | Self-hosted fonts/icons/portraits + Rain Clock GeoJSON fallback | `playwright test --project=offline` (test 1) | **PASS** (12.1 s) | **0** | **0** |
| **Web (Risk Map)** | Dashboard MapLibre offline GeoJSON schematic + ward selection | `playwright test --project=offline` (test 2) | **PASS** | **0** | **0** |
| **Web (5-Step Command Center)** | All 5 Command Center steps + Plans save/compare + Printable A4 brief | `playwright test --project=offline` (test 3) | **PASS** (4.6 s) | **0** | **0** |

---

## 2. Module-by-Module Offline Walkthrough (All 5 Operational Modules)

Every request below ran against local `http://127.0.0.1` with `ABHAS_OFFLINE=1`, zero external internet traffic, and `"offline": true` verified in every JSON response and brief footer:

| Step | Module & Endpoint | Verification Action | HTTP | `offline` | Observed Result |
|---|---|---|---:|---:|---|
| **0** | Readiness `GET /readyz` | Deep check: SQLite seeded + LightGBM SHA-256 + `supply_ratios.json` + `ward_capacity.json` | `200` | `true` | All 4 readiness checks `true`; zero network calls |
| **1** | **Forecast** (`command-step-1`, `POST /api/v1/forecast`) | `DSCC_Ward_04`, `origin_week=2024-08-05`, horizons `2, 3, 4` | `200` | `true` | Local LightGBM CPU inference (`5.0 ms`), P10–P90 conformal band + TreeSHAP |
| **2** | **Allocation** (`command-step-2`, `POST /api/v1/allocation/plan`) | `scope=Dhaka South`, `stock_pct=60`, `equity_floor_pct=20`, `total_crews=10` | `200` | `true` | Exact conservation (`1243/2072` saline, `608/1013` kits, `173/289` beds), 20% equity floor intact, 12 critical deficit wards |
| **3** | **Overflow Routing** (`command-step-3`, `POST /api/v1/overflow/route`) | `scope=Dhaka North`, `horizon=3`, `service_level=0.9` | `200` | `true` | Intra-city HiGHS MILP (`24.1 ms` cold / `12.6 ms` warm), zero cross-city transfers, `21` unroutable patients reported honestly |
| **4** | **Counterfactual Simulator** (`command-step-4`, `POST /api/v1/simulator/run`) | `auto_crews=10`, `efficacy=base`, `origin_week=2024-08-05` | `200` | `true` | `90.56` cases prevented (`[48.61–112.55]` Low–High band), `26.99` beds & `215.99` saline avoided, ROI ranked |
| **5** | **Dispatch & Plans** (`command-step-5`, `POST /api/v1/dispatch/notices`, `GET /api/v1/dispatch/brief/DSCC_Ward_04.html`, `POST /api/v1/plans`, `GET /api/v1/plans/compare`) | Bangla (`lang=bn`) SMS/WhatsApp + A4 HTML brief + Save Plan A/B + Compare Plans | `200` / `201` | `true` | UCS-2 Bangla SMS (`2–3 seg`), self-contained zero-URL A4 brief (`offline=true` in footer), append-only plan comparison (`6+` metric diffs) |

---

## 3. Physical Wi-Fi Disconnect Verification & Stage Drill Protocol

> **Honesty note:** Because this automated integration environment runs inside a sandboxed workstation where the AI agent does not toggle the host OS's physical Wi-Fi radio, automated proof above used strict OS-level Python socket blocking (`socket.socket.connect` failing any non-loopback host) plus Chromium `page.route("**/*")` aborting every non-localhost URL (`net::ERR_INTERNET_DISCONNECTED`). **Before judging**, the human presenter must run the 2-minute physical Wi-Fi drill below on the presentation laptop and check off the sign-off box.

### Physical Wi-Fi Disconnect Checklist (Run Once Before Judging + Live at 5:40 of Demo)
1. Start local stack: `npm run dev` (or `ABHAS_OFFLINE=1 NEXT_PUBLIC_ABHAS_OFFLINE=1 npm run dev`).
2. Open `http://localhost:3000/dashboard?demo=1&tab=command` and verify `ProvenanceStrip` shows `git_sha` matching `git rev-parse --short HEAD`.
3. **Physically disconnect Wi-Fi / enable Airplane Mode** on the presentation laptop.
4. Wait ≤ 30 s (or already in `ABHAS_OFFLINE=1`) and confirm the **`Offline`** badge renders in `ProvenanceStrip` (`"offline": true`).
5. Click through all 5 modules while disconnected:
   - [ ] **Step 1 (Forecast):** switch scope `all` → `Dhaka South` — forecast table updates with zero errors.
   - [ ] **Step 2 (Allocate):** drag **Available Regional Stock** slider `100%` → `60%` → `45%` — allocations & deficit badges re-solve live in < 200 ms.
   - [ ] **Step 3 (Route):** verify city utilisation cards and edit a ward capacity override — transfers re-compute cleanly.
   - [ ] **Step 4 (Simulate):** toggle `Auto 10 crews` and `Low / Base / High` presets — ROI table and sensitivity band update cleanly.
   - [ ] **Step 5 (Dispatch):** toggle `EN (GSM-7)` ↔ `বাংলা (UCS-2)`, click **Open Printable Brief**, confirm self-contained A4 HTML renders with zero broken assets and `offline=true` in footer.
6. Re-enable Wi-Fi and confirm the app recovers without reload.
