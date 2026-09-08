import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-ink text-white hover:bg-black shadow-sm shadow-black/5",
  secondary:
    "bg-white text-ink border border-border hover:border-ink/30",
  ghost: "bg-transparent text-ink hover:bg-black/5",
  danger:
    "bg-white text-red-600 border border-red-200 hover:bg-red-50 hover:border-red-300",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium tracking-tight transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
