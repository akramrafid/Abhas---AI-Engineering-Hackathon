import type { SelectHTMLAttributes } from "react";
import { clsx } from "clsx";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  id: string;
  label: string;
  options: readonly SelectOption[];
  testId?: string;
  mono?: boolean;
}

export function SelectField({
  id,
  label,
  options,
  testId,
  mono = false,
  className,
  ...props
}: SelectFieldProps) {
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={id}
        className="text-[11px] font-semibold tracking-tight text-slate"
      >
        {label}
      </label>
      <select
        id={id}
        data-testid={testId}
        className={clsx(
          "min-h-10 rounded-xl border border-mist/95 bg-paper/45 px-3 py-2 text-sm font-medium text-navy transition-all duration-150",
          "hover:border-royal/40 hover:bg-white focus-visible:border-royal focus-visible:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-royal/12",
          "disabled:cursor-not-allowed disabled:bg-paper disabled:text-slate",
          mono && "tnum",
        )}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
