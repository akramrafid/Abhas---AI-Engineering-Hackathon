// k6 load test for Abhas API — proves NFR-2 (Phase 1 GETs & cached forecasts p95 < 300 ms +
// weighted Phase 2 command-center operational endpoints under 20 total VUs for 30 s, error rate < 1%).
// Run via: npm run load
import http from "k6/http";
import { check, sleep } from "k6";

const API = (__ENV.API || "http://127.0.0.1:8000").replace(/\/$/, "");
const VALID_TIERS = new Set(["Low", "Medium", "High", "Critical"]);
const JSON_HEADERS = { "Content-Type": "application/json" };

export const options = {
  scenarios: {
    // 16 VUs (80% weight): municipal dashboard reads & forecasts (Phase 1)
    p1_dashboard: {
      executor: "constant-vus",
      exec: "phase1Dashboard",
      vus: 16,
      duration: "30s",
    },
    // 4 VUs (20% weight): Command Center optimization & dispatch workflows (Phase 2)
    p2_command: {
      executor: "constant-vus",
      exec: "phase2Command",
      vus: 4,
      duration: "30s",
    },
  },
  thresholds: {
    // Phase 1 GETs & cached forecasts strictly stay below 300 ms p95 (NFR-2).
    "http_req_duration{phase:p1_get}": ["p(95)<300"],
    "http_req_duration{endpoint:forecast}": ["p(95)<300"],
    "http_req_duration{endpoint:scenario}": ["p(95)<600"],
    // Phase 2 operational endpoints (QA Q4) with per-endpoint CPU budgets under 20-VU total load.
    "http_req_duration{endpoint:allocation}": ["p(95)<1200"],
    "http_req_duration{endpoint:overflow}": ["p(95)<400"],
    "http_req_duration{endpoint:simulator}": ["p(95)<800"],
    "http_req_duration{endpoint:dispatch}": ["p(95)<900"],
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
  },
};

export function setup() {
  const res = http.get(`${API}/api/v1/wards`, { tags: { endpoint: "setup_wards" } });
  let wardIds = ["DSCC_Ward_04", "DSCC_Ward_07", "DNCC_Ward_09"];
  if (res.status === 200) {
    try {
      const body = res.json();
      if (Array.isArray(body.wards) && body.wards.length > 0) {
        wardIds = body.wards.map((w) => w.ward_id).filter(Boolean);
      }
    } catch (_) {
      // Fall back to default ward IDs if body cannot be parsed.
    }
  }
  const originWeek = "2024-08-05";
  // Warm the forecast cache once before measuring steady-state load.
  http.post(
    `${API}/api/v1/forecast`,
    JSON.stringify({
      ward_ids: wardIds,
      origin_week: originWeek,
      horizons: [1, 2, 3, 4],
      source: "dataset",
    }),
    { headers: JSON_HEADERS, tags: { endpoint: "setup_warmup" } },
  );
  return { wardIds, originWeek };
}

function safeJson(res) {
  try {
    return res.json();
  } catch (_) {
    return null;
  }
}

export function phase1Dashboard(data) {
  const wardId = data.wardIds[(__VU + __ITER) % data.wardIds.length];

  const healthRes = http.get(`${API}/healthz`, { tags: { endpoint: "healthz", phase: "p1_get" } });
  const healthBody = safeJson(healthRes);
  check(healthRes, {
    "healthz 200": (r) => r.status === 200,
    "healthz status ok": () => healthBody !== null && healthBody.status === "ok",
  });

  const wardsRes = http.get(`${API}/api/v1/wards`, { tags: { endpoint: "wards", phase: "p1_get" } });
  const wardsBody = safeJson(wardsRes);
  check(wardsRes, {
    "wards 200": (r) => r.status === 200,
    "wards non-empty": () =>
      wardsBody !== null && Array.isArray(wardsBody.wards) && wardsBody.wards.length > 0,
  });

  const lagsRes = http.get(`${API}/api/v1/wards/${wardId}/lags`, {
    tags: { endpoint: "lags", phase: "p1_get" },
  });
  const lagsBody = safeJson(lagsRes);
  check(lagsRes, {
    "lags 200": (r) => r.status === 200,
    "lags has 9 correlations (0-8)": () =>
      lagsBody !== null && Array.isArray(lagsBody.correlations) && lagsBody.correlations.length === 9,
  });

  const forecastRes = http.post(
    `${API}/api/v1/forecast`,
    JSON.stringify({
      ward_ids: [wardId],
      origin_week: data.originWeek,
      horizons: [1, 2, 3, 4],
      source: "dataset",
    }),
    { headers: JSON_HEADERS, tags: { endpoint: "forecast", phase: "p1_post" } },
  );
  const forecastBody = safeJson(forecastRes);
  check(forecastRes, {
    "forecast 200": (r) => r.status === 200,
    "forecast returns 4 valid horizons": () => {
      if (!forecastBody || !Array.isArray(forecastBody.forecasts) || forecastBody.forecasts.length !== 1) {
        return false;
      }
      const horizons = forecastBody.forecasts[0].horizons;
      return (
        Array.isArray(horizons) &&
        horizons.length === 4 &&
        horizons.every((h) => VALID_TIERS.has(h.tier) && h.p10 <= h.expected_cases && h.expected_cases <= h.p90)
      );
    },
  });

  if ((__VU + __ITER) % 4 === 0) {
    const scenarioRes = http.post(
      `${API}/api/v1/scenario`,
      JSON.stringify({
        ward_id: wardId,
        origin_week: data.originWeek,
        horizons: [1, 2, 3, 4],
        weather: { rainfall_mm: 120.0 },
      }),
      { headers: JSON_HEADERS, tags: { endpoint: "scenario", phase: "p1_post" } },
    );
    const scenarioBody = safeJson(scenarioRes);
    check(scenarioRes, {
      "scenario 200": (r) => r.status === 200,
      "scenario returns baseline and scenario horizons": () =>
        scenarioBody !== null &&
        Array.isArray(scenarioBody.baseline) &&
        scenarioBody.baseline.length === 4 &&
        Array.isArray(scenarioBody.scenario) &&
        scenarioBody.scenario.length === 4,
    });
  }

  sleep(0.5);
}

export function phase2Command(data) {
  const p2Slot = (__VU + __ITER) % 4;
  if (p2Slot === 0) {
    const allocRes = http.post(
      `${API}/api/v1/allocation/plan`,
      JSON.stringify({
        scope: "all",
        origin_week: data.originWeek,
        stock_pct: 60,
        total_crews: 10,
      }),
      { headers: JSON_HEADERS, tags: { endpoint: "allocation", phase: "p2" } },
    );
    const allocBody = safeJson(allocRes);
    check(allocRes, {
      "allocation 200": (r) => r.status === 200,
      "allocation covers 60 wards": () =>
        allocBody !== null && Array.isArray(allocBody.wards) && allocBody.wards.length === 60,
    });
  } else if (p2Slot === 1) {
    const ovRes = http.post(
      `${API}/api/v1/overflow/route`,
      JSON.stringify({
        scope: "all",
        origin_week: data.originWeek,
        horizon: 3,
      }),
      { headers: JSON_HEADERS, tags: { endpoint: "overflow", phase: "p2" } },
    );
    const ovBody = safeJson(ovRes);
    check(ovRes, {
      "overflow 200": (r) => r.status === 200,
      "overflow covers 5 cities": () =>
        ovBody !== null && Array.isArray(ovBody.cities) && ovBody.cities.length === 5,
    });
  } else if (p2Slot === 2) {
    const simRes = http.post(
      `${API}/api/v1/simulator/run`,
      JSON.stringify({
        origin_week: data.originWeek,
        deployments: [
          { ward_id: "DSCC_Ward_04", crews: 2 },
          { ward_id: "DNCC_Ward_09", crews: 2 },
          { ward_id: "CCC_Ward_03", crews: 1 },
        ],
        efficacy: "base",
      }),
      { headers: JSON_HEADERS, tags: { endpoint: "simulator", phase: "p2" } },
    );
    const simBody = safeJson(simRes);
    check(simRes, {
      "simulator 200": (r) => r.status === 200,
      "simulator returns 3 wards": () =>
        simBody !== null && Array.isArray(simBody.wards) && simBody.wards.length === 3,
    });
  } else {
    const dispRes = http.post(
      `${API}/api/v1/dispatch/notices`,
      JSON.stringify({
        origin_week: data.originWeek,
        scope: "Dhaka South",
        channels: ["sms"],
        lang: "en",
        stock_pct: 60,
        total_crews: 10,
      }),
      { headers: JSON_HEADERS, tags: { endpoint: "dispatch", phase: "p2" } },
    );
    const dispBody = safeJson(dispRes);
    check(dispRes, {
      "dispatch 200": (r) => r.status === 200,
      "dispatch returns 20 DSCC notices": () =>
        dispBody !== null && Array.isArray(dispBody.notices) && dispBody.notices.length === 20,
    });
  }

  sleep(0.5);
}
