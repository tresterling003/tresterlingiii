"use client";
import clsx from "clsx";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Toast = { id: number; kind: "success" | "error"; title: string; body?: string };
const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((xs) => [...xs.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 p-4 lg:items-end">
        {toasts.map((t) => (
          <div key={t.id}
            className={clsx(
              "pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-3 rounded-md border bg-ink-800 px-4 py-3 shadow-pop",
              t.kind === "success" ? "border-lime/30" : "border-danger/40",
            )}>
            {t.kind === "success"
              ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-lime" />
              : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />}
            <div className="min-w-0">
              <p className="text-sm font-semibold">{t.title}</p>
              {t.body && <p className="mt-0.5 text-xs text-fg-muted">{t.body}</p>}
            </div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
