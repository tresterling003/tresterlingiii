"use client";
import { useState } from "react";
import { useWorld, world } from "@/engine/store";
import { refreshSource } from "@/engine/adapters/registry";
import { demo } from "@/engine/adapters/demo";
import { api } from "@/engine/poll";
import { toast } from "@/engine/actions";
import { relativeTime } from "@/domain/time";
import { pileTier } from "@/domain/mail";
import { Panel, SourceStatus, ConnectGoogle } from "../Panel";

const TIER_LINE = ["The floor is clear.", "A few letters by the door.", "A tidy stack by the door.", "Quite the pile by the door!"];

export function InboxPanel() {
  const mail = useWorld((s) => s.mail);
  const mode = useWorld((s) => s.mode);
  const now = useWorld((s) => s.now);
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const isDemo = mode === "demo";
  const data = mail.data;
  const needsConnect = !isDemo && mail.error && ["not_connected", "not_configured", "reauth_required", "standalone"].includes(mail.error.code);

  const markRead = async (id: string) => {
    setBusy(id);
    try {
      if (isDemo) demo.markRead(id);
      else {
        await api("/api/gmail/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
        const m = world.get().mail.data;
        if (m) world.set({ mail: { ...world.get().mail, data: { ...m, unreadCount: Math.max(0, m.unreadCount - 1), messages: m.messages.filter((x) => x.id !== id) } } });
      }
    } catch (e) {
      toast({ title: "Couldn't mark as read", body: (e as Error).message, tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel title="Mail by the door" skin="letter" width={560} sample={isDemo}>
      {!isDemo && !needsConnect && <SourceStatus status={mail.status} error={needsConnect ? null : mail.error} updatedAt={mail.updatedAt} now={now} onRefresh={() => refreshSource("gmail")} />}
      {needsConnect && <ConnectGoogle code={mail.error!.code} missing={mail.error!.missing} />}
      {!needsConnect && mail.status === "loading" && !data && <Skeleton />}
      {data && (
        <>
          <div className="flex items-baseline gap-3 mb-4">
            <span className="font-display text-[44px] leading-none font-semibold">{data.unreadCount}</span>
            <span className="text-[17px]">
              unread {isDemo ? "sample " : ""}
              {data.unreadCount === 1 ? "letter" : "letters"}
              <span className="block text-sm text-ink-soft">{TIER_LINE[pileTier(data.unreadCount)]}</span>
            </span>
          </div>
          {data.messages.length === 0 ? (
            <p className="text-center py-8 font-display text-lg">Nothing waiting. Enjoy the quiet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.messages.map((m) => {
                const open = openId === m.id;
                return (
                  <li key={m.id} className="rounded-xl border-[3px] border-ink/80 bg-[#fffdf7] shadow-[0_2px_0_#4A342855]">
                    <button type="button" className="w-full text-left px-4 py-3 flex gap-3 items-start rounded-xl" aria-expanded={open} onClick={() => setOpenId(open ? null : m.id)}>
                      <span className="mt-1 w-9 h-9 shrink-0 rounded-full bg-teal-soft border-[3px] border-ink grid place-items-center font-display text-[15px]" aria-hidden>
                        {m.from.trim().charAt(0).toUpperCase() || "?"}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex gap-2 items-baseline">
                          <span className="font-bold truncate flex-1">{m.from}</span>
                          <time className="text-xs text-ink-soft shrink-0" dateTime={new Date(m.receivedAt).toISOString()}>{relativeTime(m.receivedAt, now)}</time>
                        </span>
                        <span className="block font-display text-[16px] truncate">{m.subject}</span>
                        <span className={`block text-sm text-ink-soft ${open ? "" : "line-clamp-1"}`}>{m.snippet}</span>
                      </span>
                    </button>
                    {open && (
                      <div className="px-4 pb-3 flex gap-2 flex-wrap">
                        {m.url ? (
                          <a className="btn btn-sm btn-teal" href={m.url} target="_blank" rel="noopener noreferrer">Open in Gmail</a>
                        ) : (
                          <span className="text-sm text-ink-soft self-center">Sample letter — there's nothing to open in Gmail.</span>
                        )}
                        {data.canMarkRead && (
                          <button type="button" className="btn btn-sm" disabled={busy === m.id} onClick={() => markRead(m.id)}>
                            {busy === m.id ? "Marking…" : "Mark as read"}
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {data.unreadCount > data.messages.length && <p className="text-sm text-ink-soft mt-3 text-center">Showing the newest {data.messages.length}. The rest are waiting in Gmail.</p>}
          {!isDemo && !data.canMarkRead && <p className="text-xs text-ink-soft mt-4">Read-only: Living Space never changes your mail. Set GOOGLE_ALLOW_MARK_READ=true to enable a manual “Mark as read”.</p>}
        </>
      )}
    </Panel>
  );
}

export function Skeleton() {
  return (
    <div className="flex flex-col gap-2" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 rounded-xl bg-paper-edge/60 animate-pulse" />
      ))}
    </div>
  );
}
