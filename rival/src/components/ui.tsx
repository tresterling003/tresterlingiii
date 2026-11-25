"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import {
  Bell, Candy, CandyCane, Cookie, Crown, Flame, Gift, Heart, Loader2, Music, Snowflake, Sparkles, Star, TreePine, X,
  type LucideIcon,
} from "lucide-react";
import { COLORS, type ColorKey } from "@/lib/catalog";

/* ------------------------------------------------------------- buttons */

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "soft" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  busy?: boolean;
};

export function Button({ variant = "primary", size = "md", busy, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition active:scale-95 disabled:opacity-50 disabled:active:scale-100 whitespace-nowrap",
        size === "sm" && "h-9 px-4 text-sm",
        size === "md" && "h-11 px-5 text-[16px]",
        size === "lg" && "h-14 px-7 text-lg",
        variant === "primary" && "bg-accent text-onaccent shadow-soft hover:brightness-110",
        variant === "soft" && "bg-card text-ink shadow-soft hover:shadow-pop",
        variant === "ghost" && "text-ink hover:bg-ink/5",
        variant === "danger" && "text-accent hover:bg-accent/10",
        className,
      )}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function RoundButton({ label, children, onClick, className }: { label: string; children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={clsx("grid h-12 w-12 place-items-center rounded-full bg-card text-ink shadow-soft transition hover:shadow-pop active:scale-90", className)}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------- avatar */

export const AVATAR_ICONS: Record<string, LucideIcon> = {
  tree: TreePine, gift: Gift, star: Star, snowflake: Snowflake, bell: Bell, candy: CandyCane, cookie: Cookie,
  crown: Crown, sparkles: Sparkles, music: Music, heart: Heart, flame: Flame, lollipop: Candy,
};

export function Avatar({ avatar, color, size = 40, className }: { avatar: string; color: string; size?: number; className?: string }) {
  const Icon = AVATAR_ICONS[avatar] ?? TreePine;
  const c = COLORS[color as ColorKey] ?? COLORS.red;
  return (
    <span
      className={clsx("inline-grid shrink-0 place-items-center rounded-full", className)}
      style={{ width: size, height: size, background: `var(--c-${color}-bg, ${c.bg})`, color: `var(--c-${color}-fg, ${c.fg})` }}
      aria-hidden
    >
      <Icon style={{ width: size * 0.52, height: size * 0.52 }} strokeWidth={2.2} />
    </span>
  );
}

/* ------------------------------------------------------------- sheet (modal) */

export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setTimeout(() => ref.current?.querySelector<HTMLElement>("input,textarea,button[data-autofocus]")?.focus(), 60);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="anim-fade absolute inset-0 bg-black/35 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={ref}
        className={clsx(
          "anim-pop relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl3 bg-bg shadow-pop sm:rounded-xl3",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full bg-card shadow-soft active:scale-90">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-2">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- form */

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[15px] font-medium">{label}</span>
      {children}
      {hint && <span className="text-[13px] text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-2xl border border-line bg-card px-4 py-3 text-ink placeholder:text-muted/70 outline-none transition focus:border-accent/60 focus:ring-4 focus:ring-accent/10";

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full bg-ink/5 p-1">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx("h-10 flex-1 rounded-full px-3 text-[15px] font-medium transition", value === o.value ? "bg-card shadow-soft" : "text-muted")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-2xl border border-line bg-card px-4 py-3"
    >
      <span className="font-medium">{label}</span>
      <span className={clsx("relative h-7 w-12 rounded-full transition", checked ? "bg-good" : "bg-ink/15")}>
        <span className={clsx("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------- states */

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={clsx("grid place-items-center py-16 text-muted", className)}>
      <Loader2 className="h-7 w-7 animate-spin" />
    </div>
  );
}

export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="anim-rise grid place-items-center gap-3 rounded-xl3 border-2 border-dashed border-line bg-card/60 px-6 py-12 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-accent/10 text-accent">
        <Icon className="h-8 w-8" />
      </span>
      <h3 className="text-xl font-semibold">{title}</h3>
      {children && <div className="max-w-sm text-muted">{children}</div>}
    </div>
  );
}

export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="rounded-xl2 bg-accent/10 p-5 text-center">
      <p className="font-medium text-accent">{message}</p>
      {retry && (
        <Button variant="soft" size="sm" className="mt-3" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- toast */

type Toast = { id: number; text: string; action?: { label: string; run: () => void } };
const ToastCtx = createContext<(text: string, action?: Toast["action"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, action?: Toast["action"]) => {
    const id = Date.now() + Math.random();
    setItems((t) => [...t.slice(-2), { id, text, action }]);
    setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), action ? 6500 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[max(14px,env(safe-area-inset-top))] z-[60] flex flex-col items-center gap-2 px-4" role="status">
        {items.map((t) => (
          <div key={t.id} className="anim-pop pointer-events-auto flex items-center gap-3 rounded-full bg-ink px-5 py-3 text-[15px] font-medium text-bg shadow-pop">
            {t.text}
            {t.action && (
              <button
                className="font-semibold text-[#F2C14E]"
                onClick={() => {
                  t.action!.run();
                  setItems((x) => x.filter((y) => y.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------------------------------------- page header */

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[32px] font-semibold leading-tight sm:text-[40px]">{title}</h1>
        {sub && <p className="mt-1 text-[17px] text-muted">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx("panel rounded-xl3 p-4 shadow-soft sm:p-6", className)}>{children}</section>;
}
