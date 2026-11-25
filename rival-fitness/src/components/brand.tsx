import clsx from "clsx";

/**
 * RIVAL mark: two opposing strokes meeting in a "V" — lime is you, white is
 * your rival. Used as app icon, favicon and in the wordmark.
 */
export function RivalMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#0E0F12" />
      <path d="M6.5 7h6.2l4.6 13.4L14.2 27z" fill="#C8FF3D" />
      <path d="M25.5 7h-6.2l-3.1 9.1 3.1 9.3z" fill="#F4F5F7" />
    </svg>
  );
}

export function Wordmark({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const text = { sm: "text-xl", md: "text-2xl", lg: "text-[44px] leading-none" }[size];
  const mark = { sm: 24, md: 28, lg: 44 }[size];
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <RivalMark size={mark} />
      <span className={clsx("font-display font-extrabold italic tracking-[0.02em] text-fg", text)}>RIVAL</span>
    </span>
  );
}

export const TAGLINE = "Every Move Counts. Every Week Matters.";
