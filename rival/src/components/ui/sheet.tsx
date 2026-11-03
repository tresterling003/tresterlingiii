"use client";
import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Bottom sheet on phones, centered dialog on larger screens. */
export function Sheet({
  open, onClose, title, children, footer, wide,
}: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>("[data-autofocus], input, button")?.focus(), 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-[fade-up_200ms_ease-out_both] bg-black/70" onClick={onClose} aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title}
        className={clsx(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-lg border border-ink-700 bg-ink-850 shadow-sheet animate-sheet-up sm:rounded-lg sm:animate-fade-up",
          wide ? "sm:max-w-2xl" : "sm:max-w-md",
        )}>
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-ink-600 sm:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between px-6 pb-2 pt-4">
          <h2 className="font-display text-xl font-bold italic tracking-wide">{title}</h2>
          <button onClick={onClose} aria-label="Close"
            className="focus-ring -mr-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-fg-muted hover:bg-ink-800 hover:text-fg">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6">{children}</div>
        {footer && <div className="safe-b border-t border-ink-700 bg-ink-850 px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
