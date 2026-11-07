"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { closePanel } from "@/engine/actions";
import { useWorld } from "@/engine/store";
import { PixelIcon } from "./PixelIcon";

export type PanelSkin = "paper" | "letter" | "screen" | "phone" | "note" | "card" | "postcard";

interface Props {
  title: string;
  skin: PanelSkin;
  children: ReactNode;
  width?: number;
  headerExtra?: ReactNode;
  sample?: boolean;
}

/**
 * Shared overlay shell. Each skin looks like the object it came from (paper, a monitor,
 * a phone, a sticky note…). It grows out of the clicked object, traps focus, closes on
 * Escape/scrim, and returns focus to the object.
 */
export function Panel({ title, skin, children, width = 520, headerExtra, sample }: Props) {
  const origin = useWorld((s) => s.ui.origin);
  const ref = useRef<HTMLDivElement>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    returnTo.current = document.activeElement;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>("button, a, input, select, textarea");
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closePanel();
      }
      if (e.key === "Tab" && el) {
        const f = Array.from(el.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input, select, textarea, [tabindex='0']")).filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const a = f[0];
        const b = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          b.focus();
        } else if (!e.shiftKey && document.activeElement === b) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      (returnTo.current as HTMLElement | null)?.focus?.({ preventScroll: true });
    };
  }, []);

  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const ox = origin ? `${origin.x - vw / 2 + width / 2}px` : "50%";
  const oy = origin ? `${origin.y - vh / 2 + 300}px` : "50%";

  return (
    <>
      <div className="panel-scrim" onClick={closePanel} aria-hidden />
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-none" style={{ padding: "calc(12px + var(--safe-t)) calc(12px + var(--safe-r)) calc(12px + var(--safe-b)) calc(12px + var(--safe-l))" }}>
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={`skin-${skin} pointer-events-auto relative w-full flex flex-col animate-panel-in`}
          style={{ maxWidth: width, maxHeight: "min(86dvh, 760px)", transformOrigin: `${ox} ${oy}` }}
        >
          <div className="skin-head flex items-center gap-3 px-5 pt-4 pb-3">
            <h2 className="font-display text-[25px] leading-7 font-bold flex-1 min-w-0 truncate">{title}</h2>
            {sample && <span className="stamp text-tomato">Sample data</span>}
            {headerExtra}
            <button type="button" className="btn btn-sm btn-ghost !min-w-[44px] !min-h-[44px] -mr-2" onClick={closePanel} aria-label="Close">
              <PixelIcon name="close" size={21} />
            </button>
          </div>
          <div className="skin-body scroll-soft overflow-y-auto px-5 pb-5 flex-1 min-h-0">{children}</div>
        </div>
      </div>
    </>
  );
}

/** Shared status line for any live source: loading / error / reconnect / last updated / refresh. */
export function SourceStatus({
  status,
  error,
  updatedAt,
  onRefresh,
  now,
  live = true,
}: {
  status: string;
  error: { code: string; message: string; missing?: string[] } | null;
  updatedAt: number;
  onRefresh?: () => void;
  now: number;
  live?: boolean;
}) {
  const online = useWorld((s) => s.online);
  const ago = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 60000)) : null;
  return (
    <div className="flex items-center gap-2 text-sm text-ink-soft mb-3 flex-wrap">
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${!online ? "bg-honey" : status === "error" ? "bg-tomato" : status === "ready" ? "bg-sage" : "bg-paper-line"}`} aria-hidden />
      <span className="flex-1 min-w-0">
        {!online
          ? `Offline${ago != null ? ` · showing what was known ${ago} min ago` : ""}`
          : status === "loading"
            ? "Checking…"
            : status === "error" && error
              ? error.message
              : ago != null
                ? `${live ? "Live" : "Updated"} · ${ago === 0 ? "just now" : `${ago} min ago`}`
                : "Not loaded yet"}
      </span>
      {onRefresh && (
        <button type="button" className="btn btn-sm" onClick={onRefresh} disabled={!online || status === "loading"}>
          Refresh
        </button>
      )}
    </div>
  );
}

export function ConnectGoogle({ code, missing }: { code: string; missing?: string[] }) {
  if (code === "not_configured")
    return (
      <div className="border-[3px] border-dashed border-ink/40 p-4 text-[16px]">
        <p className="font-display text-lg mb-1">Live Google data isn't set up on this server yet</p>
        <p className="mb-2">Add these to <code className="font-mono text-sm">.env.local</code> and restart:</p>
        <ul className="list-disc pl-5 font-mono text-sm mb-2">{(missing ?? ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "SESSION_SECRET"]).map((m) => <li key={m}>{m}</li>)}</ul>
        <p className="text-sm text-ink-soft">See README → “Connecting Google”. Until then nothing is shown here, because we don't make up mail or plans.</p>
      </div>
    );
  return (
    <div className="border-[3px] border-dashed border-ink/40 p-4 text-[16px]">
      <p className="mb-3">{code === "reauth_required" ? "Google access expired or was revoked." : "Connect your Google account to see your real mail and today's plans."}</p>
      <a className="btn btn-primary" href="/api/auth/google">
        {code === "reauth_required" ? "Reconnect Google" : "Connect Google"}
      </a>
      <p className="text-sm text-ink-soft mt-2">Read-only access to Gmail and Calendar. Tokens stay on the server, in an encrypted cookie.</p>
    </div>
  );
}
