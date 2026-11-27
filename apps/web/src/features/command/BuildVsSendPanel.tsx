"use client";

import { useState } from "react";
import { clsx } from "clsx";
import type { StructuralPlannerResponse } from "@/lib/api/client";
import type { Lang } from "@/lib/i18n";

export interface BuildVsSendPanelProps {
  data?: StructuralPlannerResponse;
  isPending?: boolean;
  isError?: boolean;
  lang?: Lang;
}

const SIGNAL_STYLES: Record<
  string,
  { en: string; bn: string; className: string }
> = {
  build_and_send: {
    en: "Build + Send",
    bn: "ড্রেনেজ + স্প্রে",
    className: "bg-[#0B1A5C] text-white",
  },
  build_priority: {
    en: "Build priority",
    bn: "ড্রেনেজ অগ্রাধিকার",
    className: "bg-[#2F5BFF] text-white",
  },
  send_priority: {
    en: "Send priority",
    bn: "স্প্রে অগ্রাধিকার",
    className: "bg-[#FEF3C7] text-[#78350F] ring-1 ring-[#F59E0B]/40",
  },
  monitor: {
    en: "Monitor",
    bn: "পর্যবেক্ষণ",
    className: "bg-paper text-slate ring-1 ring-mist",
  },
};

export function BuildVsSendPanel({
  data,
  isPending = false,
  isError = false,
  lang = "en",
}: BuildVsSendPanelProps) {
  const bn = lang === "bn";
  const [showAll, setShowAll] = useState(false);

  if (isPending) {
    return (
      <section
        data-testid="build-vs-send-loading"
        className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-mist/90"
      >
        <div className="h-5 w-64 animate-pulse rounded bg-mist/60" />
        <div className="mt-3 h-28 animate-pulse rounded-xl bg-paper" />
      </section>
    );
  }

  if (isError || !data) {
    return null;
  }

  const visibleWards = showAll ? data.wards : data.wards.slice(0, 12);
  const s = data.summary;

  return (
    <section
      data-testid="build-vs-send-panel"
      aria-labelledby="build-vs-send-heading"
      className="mt-5 rounded-2xl bg-white p-5 text-ink ring-1 ring-mist/90"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p
            lang={lang}
            className={clsx(
              "font-mono text-[11px] font-semibold uppercase tracking-wider text-royal",
              bn && "font-bangla normal-case tracking-normal",
            )}
          >
            {bn
              ? "ADR-0021 · কাঠামোগত সমাধান বনাম মৌসুমি স্প্রে দল"
              : "ADR-0021 · Structural Drainage & Sanitation vs Recurring Spray Crews"}
          </p>
          <h3
            id="build-vs-send-heading"
            lang={lang}
            className={clsx(
              "mt-1 text-lg font-bold tracking-tight text-navy",
              bn && "font-bangla",
            )}
          >
            {bn
              ? "নির্মাণ বনাম মোতায়েন (Build vs send)"
              : "Build vs send — Structural-fix planner"}
          </h3>
        </div>

        <span className="inline-flex items-center rounded-full border border-mist bg-paper px-3 py-1 font-mono text-xs font-semibold text-navy tnum">
          {bn
            ? `GLM + LightGBM PD · ${data.bootstrap_resamples} বুটস্ট্র্যাপ 95% CI`
            : `Poisson GLM + LightGBM PD · ${data.bootstrap_resamples} bootstrap 95% CIs`}
        </span>
      </div>

      {/* Mandatory epistemic disclaimer (ADR-0021) */}
      <div
        role="note"
        data-testid="structural-disclaimer"
        className="mt-4 rounded-xl border border-[#C2410C]/35 bg-[#FFF7ED] px-4 py-3 text-xs text-[#7C2D12]"
      >
        <p className="font-semibold">
          {bn ? "সতর্কতা (সিমুলেটেড ডেটা): " : "Epistemic note: "}
          <span>{data.disclaimer}</span>
        </p>
        {bn ? (
          <p lang="bn" className="mt-1 font-bangla text-[11.5px] text-[#7C2D12]">
            এগুলো সিমুলেটেড ডেটার পরিসংখ্যানগত সম্পর্ক — বাস্তব মাঠের কার্যকারণ প্রমাণ নয়।
          </p>
        ) : null}
      </div>

      {/* Seasonal % reduction summary across both estimators */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            key: "wl01",
            label: bn ? "জলাবদ্ধতা −০.১" : "Water-logging −0.1",
            item: s.water_logging_minus_01,
          },
          {
            key: "wl02",
            label: bn ? "জলাবদ্ধতা −০.২" : "Water-logging −0.2",
            item: s.water_logging_minus_02,
          },
          {
            key: "san01",
            label: bn ? "স্যানিটেশন +০.১" : "Sanitation +0.1",
            item: s.sanitation_plus_01,
          },
          {
            key: "san02",
            label: bn ? "স্যানিটেশন +০.২" : "Sanitation +0.2",
            item: s.sanitation_plus_02,
          },
        ].map(({ key, label, item }) => (
          <div
            key={key}
            className="rounded-xl border border-mist/80 bg-paper/70 p-3.5"
          >
            <p
              lang={lang}
              className={clsx(
                "text-xs font-semibold text-navy",
                bn && "font-bangla",
              )}
            >
              {label}
            </p>
            <p className="mt-1 font-mono text-lg font-bold text-royal tnum">
              −{item.glm.estimate.toFixed(2)}%
              <span className="ml-1 text-[11px] font-medium text-slate">
                / {bn ? "মৌসুম" : "season"}
              </span>
            </p>
            <p className="mt-1 font-mono text-[11px] text-slate tnum">
              GLM [{item.glm.ci_low.toFixed(1)}, {item.glm.ci_high.toFixed(1)}]%
            </p>
            <p className="font-mono text-[11px] text-slate tnum">
              LGBM PD −{item.lgbm_pd.estimate.toFixed(2)}% [{item.lgbm_pd.ci_low.toFixed(1)},{" "}
              {item.lgbm_pd.ci_high.toFixed(1)}]%
            </p>
          </div>
        ))}
      </div>

      {/* Build vs Send ranked table */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-mist/80">
        <table
          data-testid="build-vs-send-table"
          className="w-full border-collapse text-left text-xs"
        >
          <thead>
            <tr className="border-b border-mist bg-paper text-[11px] font-bold uppercase tracking-wider text-navy">
              <th className="px-3 py-2.5">#</th>
              <th className="px-3 py-2.5">{bn ? "ওয়ার্ড · শহর" : "Ward · City"}</th>
              <th className="px-3 py-2.5 text-right">
                {bn ? "ড্রেনেজ −০.২ (GLM / বছর)" : "Drainage −0.2 GLM (cases/yr)"}
              </th>
              <th className="px-3 py-2.5 text-right">
                {bn ? "LGBM PD (95% CI)" : "LGBM PD (cases/yr)"}
              </th>
              <th className="px-3 py-2.5 text-right">
                {bn ? "স্যানিটেশন +০.২ (GLM)" : "Sanitation +0.2 (GLM)"}
              </th>
              <th className="px-3 py-2.5 text-right">
                {bn ? "স্প্রে ROI (রোগী/দল)" : "Crew ROI (cases/crew)"}
              </th>
              <th className="px-3 py-2.5 text-right">
                {bn ? "সমতুল্য দল/বছর" : "Crew-equiv / yr"}
              </th>
              <th className="px-3 py-2.5">{bn ? "কৌশল" : "Signal"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-mist/60">
            {visibleWards.map((w, idx) => {
              const sig = SIGNAL_STYLES[w.build_vs_send.priority_signal] ?? SIGNAL_STYLES.monitor;
              const wl02 = w.water_logging_minus_02;
              const san02 = w.sanitation_plus_02;
              return (
                <tr key={w.ward_id} className="hover:bg-paper/60">
                  <td className="px-3 py-2.5 font-mono text-slate tnum">{idx + 1}</td>
                  <td className="px-3 py-2.5">
                    <span className="font-mono font-semibold text-navy">{w.ward_id}</span>
                    <span className="ml-1.5 text-slate">{w.city}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold text-navy tnum">
                    {wl02.glm.estimate.toFixed(1)}
                    <span className="block text-[10px] font-normal text-slate">
                      [{wl02.glm.ci_low.toFixed(1)}, {wl02.glm.ci_high.toFixed(1)}]
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-navy tnum">
                    {wl02.lgbm_pd.estimate.toFixed(1)}
                    <span className="block text-[10px] text-slate">
                      [{wl02.lgbm_pd.ci_low.toFixed(1)}, {wl02.lgbm_pd.ci_high.toFixed(1)}]
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate tnum">
                    {san02.glm.estimate.toFixed(1)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-royal tnum">
                    {w.build_vs_send.sim_roi_cases_per_crew.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-navy tnum">
                    {w.build_vs_send.crew_deployments_equiv !== null &&
                    w.build_vs_send.crew_deployments_equiv !== undefined
                      ? `${w.build_vs_send.crew_deployments_equiv.toFixed(2)}×`
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      lang={lang}
                      className={clsx(
                        "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                        sig.className,
                        bn && "font-bangla",
                      )}
                    >
                      {bn ? sig.bn : sig.en}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.wards.length > 12 ? (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            data-testid="build-vs-send-toggle-all"
            onClick={() => setShowAll((prev) => !prev)}
            className={clsx(
              "cursor-pointer rounded-lg border border-mist bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:border-royal hover:bg-paper",
              bn && "font-bangla",
            )}
          >
            {showAll
              ? bn
                ? "শীর্ষ ১২টি ওয়ার্ড দেখুন"
                : "Show top 12 wards"
              : bn
                ? `সব ${data.wards.length}টি ওয়ার্ড দেখুন`
                : `Show all ${data.wards.length} wards`}
          </button>
        </div>
      ) : null}
    </section>
  );
}
