import { Info } from "@/components/icons";
import { clsx } from "clsx";

export function isStubModelVersion(modelVersion?: string | null): boolean {
  return typeof modelVersion === "string" && modelVersion.startsWith("stub");
}

export interface StubDataBannerProps {
  modelVersion?: string | null;
  testId?: string;
  className?: string;
}

/**
 * Visible notice whenever the API serves placeholder data from a stub router
 * (`model_version` starting with "stub"). Uses strictly brand neutral/Navy tokens
 * — never Lime or risk colours inside data views.
 */
export function StubDataBanner({
  modelVersion,
  testId = "stub-data-banner",
  className,
}: StubDataBannerProps) {
  if (!isStubModelVersion(modelVersion)) {
    return null;
  }

  return (
    <div
      role="status"
      data-testid={testId}
      className={clsx(
        "flex items-start gap-3 rounded-lg border border-navy/30 bg-white px-4 py-3 text-ink",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-navy text-white"
      >
        <Info className="h-4 w-4" />
      </span>
      <div className="space-y-0.5">
        <p className="font-sans text-sm font-bold text-navy">
          Sample data — model not loaded
        </p>
        <p className="text-xs leading-relaxed text-slate">
          Placeholder figures returned by{" "}
          <span className="font-mono font-semibold text-navy tnum">
            {modelVersion}
          </span>
          . Trained LightGBM predictions and hold-out metrics replace this automatically once the model artifact is loaded.
        </p>
      </div>
    </div>
  );
}
