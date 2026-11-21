import { clsx } from "clsx";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={clsx("rounded-md bg-mist", className)}
    />
  );
}

export function PanelSkeleton({
  label,
  testId,
}: {
  label: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      aria-busy="true"
      aria-live="polite"
      className="space-y-4 rounded-lg border border-mist bg-white p-5"
    >
      <p className="text-sm font-medium text-slate">{label}</p>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="h-56 w-full" />
    </div>
  );
}
