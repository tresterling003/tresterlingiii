import clsx from "clsx";
import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("skeleton", className)} aria-hidden="true" />;
}

export function EmptyState({
  icon, title, body, action, className,
}: {
  icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; className?: string;
}) {
  return (
    <div className={clsx("flex flex-col items-center px-6 py-10 text-center", className)}>
      {icon && <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-ink-800 text-fg-muted">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm text-fg-muted">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="panel flex flex-col items-center px-6 py-10 text-center">
      <AlertTriangle className="mb-3 h-6 w-6 text-warn" />
      <p className="font-semibold">Couldn&rsquo;t load this</p>
      <p className="mt-1 max-w-xs text-sm text-fg-muted">{message ?? "Check your connection and try again."}</p>
      {onRetry && (
        <button onClick={onRetry} className="focus-ring mt-4 rounded-md px-4 py-2 text-sm font-semibold text-lime hover:bg-ink-800">
          Try again
        </button>
      )}
    </div>
  );
}

export function Badge({
  children, tone = "neutral", className,
}: {
  children: ReactNode; tone?: "neutral" | "lime" | "warn" | "danger" | "info"; className?: string;
}) {
  const tones = {
    neutral: "bg-ink-750 text-fg-muted",
    lime: "bg-lime-soft text-lime",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
    info: "bg-info-soft text-info",
  };
  return (
    <span className={clsx("inline-flex h-6 items-center gap-1 rounded-sm px-2 text-2xs font-bold uppercase", tones[tone], className)}>
      {children}
    </span>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={clsx("relative inline-flex h-2 w-2", className)} aria-hidden="true">
      <span className="absolute inset-0 animate-live rounded-full bg-lime" />
    </span>
  );
}

export function SectionHeader({ title, action, className }: { title: string; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx("mb-4 flex items-center justify-between", className)}>
      <h2 className="eyebrow">{title}</h2>
      {action}
    </div>
  );
}

export function ProgressBar({ value, max, className, tone = "lime" }: { value: number; max: number; className?: string; tone?: "lime" | "muted" }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(max, 1)) * 100));
  return (
    <div className={clsx("h-1.5 w-full overflow-hidden rounded-full bg-ink-700", className)} role="progressbar"
      aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className={clsx("h-full rounded-full transition-[width] duration-500", tone === "lime" ? "bg-lime" : "bg-fg-muted")} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Ring({ value, max, size = 64, stroke = 6, children }: { value: number; max: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / Math.max(max, 1)));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#262931" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#C8FF3D" strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
