"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

interface HealthState {
  status: "checking" | "operational" | "degraded";
  apiVersion?: string;
  checks?: Record<string, boolean>;
  latencyMs?: number;
  error?: string;
}

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

export function StatusClient() {
  const [state, setState] = useState<HealthState>({ status: "checking" });

  const probe = async () => {
    setState({ status: "checking" });
    const t0 = performance.now();
    try {
      const res = await fetch(`${API_BASE}/readyz`, { cache: "no-store" });
      const latencyMs = Math.round(performance.now() - t0);
      if (!res.ok) {
        setState({ status: "degraded", latencyMs, error: `HTTP ${res.status}` });
        return;
      }
      const data = (await res.json()) as { version?: string; checks?: Record<string, boolean> };
      setState({
        status: "operational",
        apiVersion: data.version ?? "0.1.0",
        checks: data.checks ?? { database: true, model: true },
        latencyMs,
      });
    } catch {
      setState({
        status: "degraded",
        error: "Local FastAPI server not reachable at " + API_BASE + ". Start with `npm run dev`.",
      });
    }
  };

  useEffect(() => {
    const id = window.setTimeout(() => {
      void probe();
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-mist bg-white p-6">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={`h-3 w-3 rounded-full ${
              state.status === "operational"
                ? "bg-emerald-500"
                : state.status === "checking"
                  ? "animate-pulse bg-royal"
                  : "bg-slate"
            }`}
          />
          <div>
            <p className="text-base font-bold text-navy">
              {state.status === "operational"
                ? "All local forecasting services operational"
                : state.status === "checking"
                  ? "Checking local API readiness…"
                  : "API currently unreachable"}
            </p>
            <p className="text-xs text-slate tnum">
              {state.status === "operational"
                ? `API v${state.apiVersion} · /readyz responded in ${state.latencyMs} ms`
                : state.error ?? "Probing /readyz"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void probe()}
          className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-mist bg-paper px-3.5 text-xs font-semibold text-navy hover:border-royal hover:text-royal"
        >
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
          Re-check
        </button>
      </div>

      <dl className="divide-y divide-mist rounded-[14px] border border-mist bg-white px-6">
        {[
          {
            name: "Web Operations Console (Next.js)",
            ok: true,
            note: "Serving landing page, dashboard, brand kit, and docs",
          },
          {
            name: "Forecast API & LightGBM Model",
            ok: state.status === "operational" && state.checks?.model !== false,
            note: "abhas-lgbm-1.1.2 · SHA-256 verified at boot",
          },
          {
            name: "Ward Observations Database (SQLite)",
            ok: state.status === "operational" && state.checks?.database !== false,
            note: "60 wards · 31,320 weekly observations",
          },
        ].map((row) => (
          <div key={row.name} className="flex items-center justify-between gap-4 py-4">
            <div>
              <dt className="text-sm font-bold text-navy">{row.name}</dt>
              <dd className="text-xs text-slate">{row.note}</dd>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                row.ok ? "bg-royal/10 text-royal" : "bg-paper text-slate ring-1 ring-mist"
              }`}
            >
              {row.ok ? "Operational" : state.status === "checking" ? "Checking" : "Offline"}
            </span>
          </div>
        ))}
      </dl>
    </div>
  );
}
