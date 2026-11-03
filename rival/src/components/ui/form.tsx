"use client";
import clsx from "clsx";
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { Minus, Plus } from "lucide-react";

export function Field({
  label, hint, error, children, htmlFor, className,
}: {
  label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string; className?: string;
}) {
  return (
    <div className={clsx("flex flex-col gap-2", className)}>
      <label htmlFor={htmlFor} className="text-xs font-semibold text-fg-muted">{label}</label>
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-xs text-fg-faint">{hint}</p>
      ) : null}
    </div>
  );
}

const control =
  "h-12 w-full rounded-md border border-ink-700 bg-ink-800 px-4 text-base text-fg placeholder:text-fg-faint transition-colors hover:border-ink-600 focus:border-lime focus:outline-none focus:ring-1 focus:ring-lime disabled:opacity-50 aria-[invalid=true]:border-danger";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest }, ref,
) {
  return <input ref={ref} className={clsx(control, className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(control, "appearance-none bg-[length:16px] bg-[right_16px_center] bg-no-repeat pr-10", className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23A2A7B1' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
      {...rest}>
      {children}
    </select>
  );
}

export function Segmented<T extends string | number>({
  value, onChange, options, className, size = "md", label,
}: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; disabled?: boolean }[];
  className?: string; size?: "sm" | "md"; label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label}
      className={clsx("inline-flex rounded-md border border-ink-700 bg-ink-850 p-1", className)}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={clsx(
            "focus-ring flex-1 whitespace-nowrap rounded-sm font-semibold transition-colors disabled:opacity-40",
            size === "sm" ? "h-7 px-3 text-xs" : "h-9 px-4 text-sm",
            value === o.value ? "bg-ink-700 text-fg" : "text-fg-muted hover:text-fg",
          )}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  checked, onChange, label, description, disabled,
}: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: ReactNode; disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-fg">{label}</label>
        {description && <p className="mt-1 text-xs text-fg-faint">{description}</p>}
      </div>
      <button id={id} type="button" role="switch" aria-checked={checked} disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          "focus-ring relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50",
          checked ? "bg-lime" : "bg-ink-600",
        )}>
        <span className={clsx(
          "absolute top-1 h-5 w-5 rounded-full transition-transform",
          checked ? "translate-x-6 bg-lime-ink" : "translate-x-1 bg-fg",
        )} />
      </button>
    </div>
  );
}

export function Stepper({
  value, onChange, min, max, step = 1, suffix, label, id,
}: {
  value: number; onChange: (v: number) => void; min: number; max: number; step?: number; suffix?: string;
  label: string; id?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="flex h-14 items-stretch overflow-hidden rounded-md border border-ink-700 bg-ink-800">
      <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
        className="focus-ring flex w-14 items-center justify-center text-fg-muted transition-colors hover:bg-ink-750 hover:text-fg active:bg-ink-700 disabled:opacity-30">
        <Minus className="h-5 w-5" />
      </button>
      <div className="flex flex-1 items-baseline justify-center gap-1 border-x border-ink-700">
        <input id={id} aria-label={label} inputMode="numeric"
          className="tnum w-full min-w-0 bg-transparent text-center font-display text-3xl font-bold leading-[56px] text-fg focus:outline-none"
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => {
            const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
            onChange(Number.isFinite(n) ? Math.min(max, n) : 0);
          }}
          onBlur={() => onChange(clamp(value))}
        />
        {suffix && <span className="pr-4 text-sm text-fg-faint">{suffix}</span>}
      </div>
      <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
        className="focus-ring flex w-14 items-center justify-center text-fg-muted transition-colors hover:bg-ink-750 hover:text-fg active:bg-ink-700 disabled:opacity-30">
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}
