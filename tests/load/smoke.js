// k6 load test for Abhas API — proves NFR-2 (p95 < 300 ms, error rate < 1% at 20 VUs for 30 s).
// Run via: npm run load
// Note: localhost runs send all 20 VUs from 127.0.0.1; ensure RATE_LIMIT_PER_MINUTE is raised in test mode
// (e.g. with-server.mjs --env RATE_LIMIT_PER_MINUTE=10000) so the per-IP rate limiter does not return 429s.
import http from "k6/http";
import { check, sleep } from "k6";

const API = (__ENV.API || "http://127.0.0.1:8000").replace(/\/$/, "");
const VALID_TIERS = new Set(["Low", "Medium", "High", "Critical"]);
const JSON_HEADERS = { "Content-Type": "application/json" };

export const options = {
  scenarios: {
    nfr2_load: {
      executor: "constant-vus",
      vus: 20,
      duration: "30s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<300"],
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
  },
};

export function setup() {
  const res = http.get(`${API}/api/v1/wards`, { tags: { endpoint: "setup_wards" } });
  let wardIds = ["DSCC_Ward_07"];
  if (res.status === 200) {
    try {
      const body = res.json();
      if (Array.isArray(body.wards) && body.wards.length > 0) {
        wardIds = body.wards.map((w) => w.ward_id).filter(Boolean);
      }
    } catch (_) {
      // Fall back to default ward ID if body cannot be parsed.
    }
  }
  return {
    wardIds,
    // Peak monsoon Monday inside dataset bounds (2016-02-29 .. 2025-12-29).
    originWeek: "2025-08-04",
  };
}

function safeJson(res) {
  try {
    return res.json();
  } catch (_) {
    return null;
  }
}

export default function (data) {
  const wardId = data.wardIds[(__VU + __ITER) % data.wardIds.length];

  // 1. Liveness
  const healthRes = http.get(`${API}/healthz`, { tags: { endpoint: "healthz" } });
  const healthBody = safeJson(healthRes);
  check(healthRes, {
    "healthz 200": (r) => r.status === 200,
    "healthz status ok": () => healthBody !== null && healthBody.status === "ok",
  });

  // 2. Wards list
  const wardsRes = http.get(`${API}/api/v1/wards`, { tags: { endpoint: "wards" } });
  const wardsBody = safeJson(wardsRes);
  check(wardsRes, {
    "wards 200": (r) => r.status === 200,
    "wards non-empty": () =>
      wardsBody !== null && Array.isArray(wardsBody.wards) && wardsBody.wards.length > 0,
  });

  // 3. Ward rainfall lags 0-8
  const lagsRes = http.get(`${API}/api/v1/wards/${wardId}/lags`, {
    tags: { endpoint: "lags" },
  });
  const lagsBody = safeJson(lagsRes);
  check(lagsRes, {
    "lags 200": (r) => r.status === 200,
    "lags has 9 correlations (0-8)": () =>
      lagsBody !== null && Array.isArray(lagsBody.correlations) && lagsBody.correlations.length === 9,
  });

  // 4. Multi-horizon forecast
  const forecastPayload = JSON.stringify({
    ward_ids: [wardId],
    origin_week: data.originWeek,
    horizons: [1, 2, 3, 4],
    source: "dataset",
  });
  const forecastRes = http.post(`${API}/api/v1/forecast`, forecastPayload, {
    headers: JSON_HEADERS,
    tags: { endpoint: "forecast" },
  });
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

  // 5. What-if rainfall scenario
  const scenarioPayload = JSON.stringify({
    ward_id: wardId,
    origin_week: data.originWeek,
    horizons: [1, 2, 3, 4],
    weather: { rainfall_mm: 120.0 },
  });
  const scenarioRes = http.post(`${API}/api/v1/scenario`, scenarioPayload, {
    headers: JSON_HEADERS,
    tags: { endpoint: "scenario" },
  });
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

  sleep(0.5);
}
