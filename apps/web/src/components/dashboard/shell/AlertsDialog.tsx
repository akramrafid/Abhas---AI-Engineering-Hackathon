"use client";

import { ChevronRight } from "@/components/icons";
import { RiskTierBadge } from "@/components/brand/RiskTierBadge";
import { wardLabel } from "@/components/ward-map/geo";
import { formatShortDate } from "@/lib/dates";
import type { Lang } from "@/lib/i18n";
import { Dialog } from "./Dialog";
import type { WorkspaceSignals } from "./useWorkspaceSignals";

export interface AlertsDialogProps {
  signals: WorkspaceSignals;
  originWeek: string;
  lang: Lang;
  onSelectWard: (wardId: string) => void;
  onClose: () => void;
}

/** Wards at High or Critical in the selected window, worst first; each opens that ward's forecast. */
export function AlertsDialog({ signals, originWeek, lang, onSelectWard, onClose }: AlertsDialogProps) {
  return (
    <Dialog title="Ward alerts" onClose={onClose} testId="alerts-dialog">
      <p className="text-sm text-slate">
        {signals.alerts.length} of {signals.peaks.length} wards reach High or Critical in this window · forecast made{" "}
        <span className="font-mono tnum">{formatShortDate(originWeek)}</span>
      </p>
      <ul className="mt-4 max-h-[55vh] space-y-1 overflow-y-auto">
        {signals.alerts.map((ward) => (
          <li key={ward.ward_id}>
            <button
              type="button"
              onClick={() => {
                onSelectWard(ward.ward_id);
                onClose();
              }}
              className="flex w-full cursor-pointer items-center gap-3 rounded-[10px] p-2.5 text-left transition-colors hover:bg-paper"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">
                  {wardLabel(ward.ward_id)} · {ward.city}
                </span>
                <span className="block text-xs text-slate">
                  <span className="font-mono tnum">{ward.expected_cases?.toFixed(1)}</span> expected cases · week of{" "}
                  <span className="font-mono tnum">{ward.target_week ? formatShortDate(ward.target_week) : "…"}</span>
                </span>
              </span>
              {ward.tier ? <RiskTierBadge tier={ward.tier} size="sm" lang={lang} /> : null}
              <ChevronRight aria-hidden="true" className="h-4 w-4 text-slate" />
            </button>
          </li>
        ))}
        {signals.alerts.length === 0 ? (
          <li role="status" className="p-3 text-sm text-slate">
            No ward reaches High or Critical in this window. Routine surveillance.
          </li>
        ) : null}
      </ul>
    </Dialog>
  );
}
