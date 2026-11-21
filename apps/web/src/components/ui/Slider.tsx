import { clsx } from "clsx";

export interface SliderFieldProps {
  id: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  valueLabel?: string;
  minLabel?: string;
  maxLabel?: string;
  testId?: string;
  ariaValueText?: string;
  disabled?: boolean;
  className?: string;
}

export function SliderField({
  id,
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  valueLabel,
  minLabel,
  maxLabel,
  testId,
  ariaValueText,
  disabled = false,
  className,
}: SliderFieldProps) {
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-navy">
          {label}
        </label>
        {valueLabel ? (
          <span className="font-mono text-sm font-semibold text-royal tnum">
            {valueLabel}
          </span>
        ) : null}
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        data-testid={testId}
        aria-valuetext={ariaValueText}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer accent-royal disabled:cursor-not-allowed"
      />
      {minLabel || maxLabel ? (
        <div className="flex items-center justify-between font-mono text-xs text-slate tnum">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      ) : null}
    </div>
  );
}
