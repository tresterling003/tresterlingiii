"use client";
import { useWorld } from "@/engine/store";
import { dismissToast, openPanel } from "@/engine/actions";
import { PixelIcon } from "./PixelIcon";

const DEVTOOLS = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_ENABLE_DEVTOOLS === "true";

/** The only screen-space chrome: a small hanging tag (settings), mode/offline badges, toasts. */
export function Hud() {
  const mode = useWorld((s) => s.mode);
  const online = useWorld((s) => s.online);
  const g = useWorld((s) => s.status?.google);
  const mailErr = useWorld((s) => s.mail.error?.code);
  const live = mode === "live";
  const warn = live && (!g?.connected || mailErr === "reauth_required");
  return (
    <>
      <div className="fixed z-30 flex gap-2 items-start" style={{ top: "calc(10px + var(--safe-t))", right: "calc(12px + var(--safe-r))" }}>
        {DEVTOOLS && (
          <button type="button" className="hud-tag" onClick={() => openPanel("dev")} aria-label="Open dev tools">
            <PixelIcon name="wrench" size={21} />
            <span className="hidden sm:inline">Dev</span>
          </button>
        )}
        <button type="button" className="hud-tag" onClick={() => openPanel("settings")} aria-label={`Settings${warn ? " — something needs attention" : ""}`}>
          <PixelIcon name="menu" size={21} />
          <span className="hidden sm:inline">Home</span>
          {warn && <span className="w-3 h-3 bg-honey shadow-[0_0_0_3px_#4A3428]" aria-hidden />}
        </button>
      </div>
      <div className="fixed z-30 flex flex-col gap-2 items-start pointer-events-none" style={{ top: "calc(12px + var(--safe-t))", left: "calc(12px + var(--safe-l))" }}>
        {mode === "demo" && <span className="hud-badge bg-tomato text-paper">Demo · sample data</span>}
        {!online && <span className="hud-badge bg-honey text-ink">Offline · showing last known</span>}
      </div>
      <Toasts />
    </>
  );
}

function Toasts() {
  const toasts = useWorld((s) => s.toasts);
  return (
    <div className="fixed z-[60] left-1/2 -translate-x-1/2 flex flex-col gap-2 items-center w-[min(92vw,420px)]" style={{ top: "calc(56px + var(--safe-t))" }} role="status" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => {
            dismissToast(t.id);
            if (t.panel) openPanel(t.panel);
          }}
          className={`toast animate-toast-in w-full text-left ${t.tone === "error" ? "toast-error" : ""}`}
        >
          <span className={`toast-dot toast-${t.tone}`} aria-hidden />
          <span className="flex-1 min-w-0">
            <span className="block font-display text-[18px] leading-6 truncate">{t.title}</span>
            {t.body && <span className="block text-[13px] text-ink-soft">{t.body}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
