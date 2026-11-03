"use client";
import clsx from "clsx";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
};

const variants: Record<Variant, string> = {
  primary: "bg-lime text-lime-ink hover:bg-[#d4ff66] active:bg-lime-dim disabled:bg-ink-700 disabled:text-fg-faint",
  secondary: "bg-ink-750 text-fg hover:bg-ink-700 active:bg-ink-600 disabled:text-fg-faint",
  outline: "border border-ink-600 text-fg hover:bg-ink-800 active:bg-ink-750 disabled:text-fg-faint",
  ghost: "text-fg-muted hover:text-fg hover:bg-ink-800 active:bg-ink-750 disabled:text-fg-faint",
  danger: "bg-danger-soft text-danger hover:bg-danger/20 active:bg-danger/25 disabled:opacity-50",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-sm",
  md: "h-10 px-4 text-sm gap-2 rounded-md",
  lg: "h-12 px-6 text-base gap-2 rounded-md",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, block, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={clsx(
        "focus-ring relative inline-flex select-none items-center justify-center font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100",
        variants[variant], sizes[size], block && "w-full", className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner className="h-4 w-4" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label, className, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={clsx(
        "focus-ring inline-flex h-10 w-10 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-ink-800 hover:text-fg active:bg-ink-750 disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
