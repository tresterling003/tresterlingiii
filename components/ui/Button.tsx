import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger";

const variantClasses: Record<Variant, string> = {
  primary: "bg-accent text-black hover:brightness-110",
  secondary: "bg-white/10 text-white hover:bg-white/20",
  danger: "bg-red-500/20 text-red-300 hover:bg-red-500/30",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
