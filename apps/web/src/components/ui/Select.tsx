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
    <div className={clsx("flex flex-col gap-1", className)}>
      <label
        htmlFor={id}
        className="text-xs font-semibold text-slate"
      >
        {label}
      </label>
      <select
        id={id}
        data-testid={testId}
        className={clsx(
          "min-h-10 rounded-md border border-mist bg-white px-3 py-1.5 text-sm text-ink",
          "hover:border-slate focus-visible:border-royal disabled:cursor-not-allowed disabled:bg-paper disabled:text-slate",
          mono && "font-mono tnum",
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
