# Abhas (আভাস) — Live Video Demo Script (≤ 2:50)

_Target Duration: 2 minutes 42 seconds (Hard ceiling: 2:50) · Format: Uncut screen recording with voiceover (Zero slides)_  
_Pinned Demo URL: `http://localhost:3000/?demo=1`_

---

## 1. Demo Inputs & Pre-Flight Checklist

Before hitting record, verify the local environment is running in two terminal windows:
```bash
# Terminal 1: Backend API
cd apps/api && uv run uvicorn app.main:app --host 127.0.0.1 --port 8000

# Terminal 2: Web Console
cd apps/web && npm run dev
```

### Pinned Demo Inputs
- **Base Demo URL:** `http://localhost:3000/?demo=1` (pre-loads Dhaka South, Ward 4, Week 32 2024).
- **Critical Ward & Origin Week:** Ward `DSCC_Ward_04`, Origin Monday `2024-08-05` (W32).
- **Dry Baseline for What-If Scenario:** Ward `DSCC_Ward_04`, Origin Monday `2024-05-27` (W22, 0 mm rain).
- **Scenario Preset:** Click "Monsoon burst 120 mm" (or set rainfall slider to 120 mm).

---

## 2. Timing & Narration Table

| Time | Beat | Visual Screen Action | Voiceover Script & Rubric Alignment |
|---|---|---|---|
| **0:00 – 0:25** | **1. The Problem & Opening Screen** | Open browser to `http://localhost:3000/?demo=1`. Mouse hovers over header wordmark and product promise: *"আজ বৃষ্টি। তিন সপ্তাহ পরে ঝুঁকি। এখনই ব্যবস্থা নিন।"* | *"Every monsoon, dengue outbreaks overwhelm hospitals across Bangladesh. The tragedy is that we see the rainfall today, but the surge in hospital cases doesn't hit until three weeks later—when it's too late for larviciding. This is Abhas: a production-grade operations console that turns monsoon rain signals into ward-level early warnings 1 to 4 weeks ahead."* <br/>*(Rubric: R1 — Problem Framing & Real-World Mission)* |
| **0:25 – 0:55** | **2. Evidence First: The 3-Week Lag** | Click the **Lags** tab. Point mouse to the lag correlation bar chart where Lag 3 is highlighted in bold brand color. | *"Let's look at the hard evidence. Here in the Lags tab, we calculate the empirical Pearson correlation between rainfall and cases across 60 city wards. Rainfall today has virtually zero correlation with today's cases—r is just 0.03. But at lag 3—exactly three weeks later—correlation spikes to 0.468 across the dataset and 0.512 here in Dhaka South Ward 4. That matches the biology: 7 days for mosquito breeding plus 14 days of viral incubation."* <br/>*(Rubric: R2 — Multi-Week Weather Lag Pipeline)* |
| **0:55 – 1:30** | **3. Decision Support & Monotone Scenario** | Return to Overview tab. Point out Ward Risk Card, then click **Scenario** tab. Select `2024-05-27` baseline, then click preset button **"Monsoon burst 120 mm"**. | *"Now look at the decision support. On August 5, 2024, Ward 4 is flagged at Critical risk—15 expected cases with a calibrated 80% conformal band. The system provides an explicit 'Act by' date for larvicide teams and breaks down top drivers with TreeSHAP. Even better: health officers can run what-if planning. In May 2024 with zero rain, risk is Low. But simulate a 120 mm monsoon burst, and expected cases jump monotonically from 2.1 to 8.4, escalating the alert to High. More rain never paradoxically lowers risk."* <br/>*(Rubric: R3 & R5 — Monotone Risk Engine & Operations UI)* |
| **1:30 – 2:00** | **4. Citywide Priority & Printable Brief** | Click **Priority List** tab. Scroll through ranked wards. Click **"Export CSV"**, then click **"Print Brief"** (triggering print preview, then cancel). | *"Municipal officers manage entire cities, not single wards. The Priority List ranks all 60 wards by window risk with deterministic actionable directives: larviciding for rain-driven wards, sanitation drives for waste-clogged areas, and hospital supply alerts for Critical zones. Officers can export a formula-safe CSV protected against spreadsheet injection, or print a clean one-page field brief with one click."* <br/>*(Rubric: R5 — Operational Ergonomics & Safety)* |
| **2:00 – 2:25** | **5. Hold-Out Validation & $0 Cost** | Click **Validation** tab briefly to show hold-out metrics, then click **About & Cost** tab. Point to live telemetry numbers. | *"Behind this interface is rigorous engineering. On a locked 2024–2025 hold-out split, our LightGBM model beats four baselines with an 83% pass rate and 84.5% conformal coverage. The entire model is a 954-kilobyte joblib file served on CPU in under 0.6 milliseconds. Running on SQLite and free Open-Meteo weather data, our estimated monthly infrastructure cost for a municipal office is exactly zero dollars."* <br/>*(Rubric: R4 & Bonus — Production Engineering & Cost Efficiency)* |
| **2:25 – 2:42** | **6. Bilingual Bengali Support & Wrap-Up** | Click `BN` toggle in the top-right header. Point out full Bengali UI text and clean typography. | *"Finally, Abhas was built for Bangladeshi health officers. With one toggle, the entire console switches seamlessly to Bengali in Noto Sans Bengali. Fast, accessible, and mathematically grounded—Abhas delivers early warnings when action matters most. Thank you."* <br/>*(Rubric: R5 & R8 — Cultural Alignment & Delivery)* |

---

## 3. Emergency Fallback & Troubleshooting

- **If the API is not responding:** Refresh `http://localhost:3000/?demo=1`. The frontend automatically shows a graceful error banner with a "Retry" button.
- **If Next.js dev server reloads slowly:** The demo script is rehearsed on a production build (`npm run build && npm start`) to ensure instantaneous tab switching and zero layout shifts.
