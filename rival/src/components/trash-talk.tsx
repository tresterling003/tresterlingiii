"use client";
import clsx from "clsx";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSWRConfig } from "swr";
import { MessageSquare, Send, X } from "lucide-react";
import { TeamAvatar } from "./team-avatar";
import { EmptyState } from "./ui/states";
import { useToast } from "./ui/toast";
import { api, ApiError } from "@/lib/client";
import { timeAgo } from "@/lib/dates";
import { memberMap } from "@/lib/snapshot";
import type { LeagueSnapshot } from "@/lib/types";

const TAUNTS = ["Catch me if you can", "Is that all you've got?", "Just getting warmed up", "See you on the scoreboard", "Rematch next week", "GG"];

export function TrashTalk({ s, compact }: { s: LeagueSnapshot; compact?: boolean }) {
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const members = memberMap(s);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const msgs = compact ? s.messages.slice(-3) : s.messages;
  const lastId = s.messages[s.messages.length - 1]?.id;
  const isComm = s.league.commissionerId === s.me;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  const refresh = () => mutate((k) => typeof k === "string" && k.startsWith(`/api/leagues/${s.league.id}`));

  async function send(body: string) {
    const b = body.trim();
    if (!b) return;
    setBusy(true);
    try {
      await api("POST", `/api/leagues/${s.league.id}/messages`, { body: b });
      setText("");
      await refresh();
    } catch (e) {
      toast({ kind: "error", title: "Couldn't send", body: e instanceof ApiError ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api("DELETE", `/api/messages/${id}`);
      await refresh();
    } catch {}
  }

  const onSubmit = (e: FormEvent) => { e.preventDefault(); send(text); };

  return (
    <div>
      {msgs.length === 0 ? (
        <EmptyState icon={<MessageSquare className="h-5 w-5" />} title="No trash talk yet" body="Say something. Your rival sees it instantly." className="py-6" />
      ) : (
        <div ref={listRef} className={clsx("flex flex-col gap-3 overflow-y-auto px-4 py-3 sm:px-6", !compact && "max-h-80")} data-testid="chat-list">
          {msgs.map((m) => {
            const mem = members.get(m.userId);
            const mine = m.userId === s.me;
            return (
              <div key={m.id} className={clsx("group flex items-end gap-2", mine && "flex-row-reverse")}>
                {mem && <TeamAvatar abbr={mem.teamAbbr} color={mem.teamColor} src={mem.avatarUrl} size="xs" />}
                <div className={clsx("max-w-[78%] rounded-lg px-3 py-2", mine ? "rounded-br-sm bg-lime text-lime-ink" : "rounded-bl-sm bg-ink-750")}>
                  {!mine && <p className="text-[11px] font-bold" style={{ color: mem?.teamColor }}>{mem?.teamName}</p>}
                  <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
                  <p className={clsx("mt-0.5 text-[10px]", mine ? "text-lime-ink/60" : "text-fg-faint")}>{timeAgo(m.createdAt)}</p>
                </div>
                {(mine || isComm) && !compact && (
                  <button onClick={() => (mine || confirm(`Delete this message from ${mem?.teamName ?? "this player"}?`)) && remove(m.id)} aria-label="Delete message"
                    className="focus-ring rounded-sm p-1 text-fg-faint opacity-60 transition-opacity hover:text-fg sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!compact && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2 pt-1 sm:px-6">
          {TAUNTS.map((t) => (
            <button key={t} disabled={busy} onClick={() => send(t)}
              className="focus-ring shrink-0 rounded-full border border-ink-600 px-3 py-1.5 text-xs font-semibold text-fg-muted transition-colors hover:border-lime hover:text-fg active:scale-95 disabled:opacity-50">
              {t}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={onSubmit} className="flex gap-2 border-t border-ink-700 px-4 py-3 sm:px-6">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={280} placeholder="Talk some trash…"
          aria-label="Message" data-testid="chat-input"
          className="h-10 min-w-0 flex-1 rounded-md border border-ink-700 bg-ink-800 px-3 text-sm placeholder:text-fg-faint focus:border-lime focus:outline-none" />
        <button type="submit" disabled={busy || !text.trim()} aria-label="Send" data-testid="chat-send"
          className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-lime text-lime-ink transition-transform active:scale-90 disabled:bg-ink-700 disabled:text-fg-faint">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
