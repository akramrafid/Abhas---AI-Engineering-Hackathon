#!/usr/bin/env node
// Golden-path smoke test against a running API: node scripts/smoke.mjs [--api http://127.0.0.1:8000]
// QA extends it; LEAD's skeleton version checks health and that every MUST route answers with valid shapes.
const i = process.argv.indexOf("--api");
const API = (i > 0 ? process.argv[i + 1] : process.env.API_BASE_URL) || "http://127.0.0.1:8000";

async function call(method, path, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const r = await fetch(API + path, {
      method, signal: ctrl.signal,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, json: await r.json().catch(() => null) };
  } finally {
    clearTimeout(t);
  }
}

const checks = [];
const check = (name, ok, detail = "") => checks.push({ name, ok, detail });

const health = await call("GET", "/healthz");
check("healthz 200", health.status === 200);
const wards = await call("GET", "/api/v1/wards");
check("wards list", wards.status === 200 && Array.isArray(wards.json?.wards) && wards.json.wards.length > 0);
const wardId = wards.json?.wards?.[0]?.ward_id ?? "DSCC_Ward_07";
const origin = wards.json?.data_end ?? "2025-12-29";
const lags = await call("GET", `/api/v1/wards/${wardId}/lags`);
check("lags 0–8", lags.status === 200 && lags.json?.correlations?.length === 9);
const fc = await call("POST", "/api/v1/forecast", { ward_ids: [wardId], origin_week: origin, horizons: [1, 2, 3, 4] });
const h = fc.json?.forecasts?.[0]?.horizons ?? [];
check("forecast 4 horizons with tiers", fc.status === 200 && h.length === 4 && h.every((x) => ["Low", "Medium", "High", "Critical"].includes(x.tier)));
const sc = await call("POST", "/api/v1/scenario", { ward_id: wardId, origin_week: origin, weather: { rainfall_mm: 120 } });
check("scenario", sc.status === 200 && Array.isArray(sc.json?.scenario));
const bad = await call("GET", "/api/v1/wards/XYZ_Ward_99/lags");
check("unknown ward → 4xx problem", bad.status === 404 || bad.status === 422);

for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? " — " + c.detail : ""}`);
const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} smoke check(s) failed against ${API}` : `\nsmoke OK against ${API}`);
process.exit(failed ? 1 : 0);
