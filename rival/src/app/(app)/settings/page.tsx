"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import clsx from "clsx";
import { Check, LogOut } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { useMe } from "@/lib/hooks";
import type { Me } from "@/lib/types";
import { AVATARS, COLORS, EFFECTS, THEMES, type ColorKey } from "@/lib/catalog";
import { Avatar, Button, Field, PageHead, Panel, Spinner, inputCls, useToast } from "@/components/ui";

const picked = "ring-4 ring-good/50";

export default function Settings() {
  const { data: me } = useMe();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (me) setName(me.user.name); }, [me?.user.name]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me) return <Spinner />;
  const u = me.user;

  /** Saves a change and shows it immediately (optimistic), rolling back if the save fails. */
  async function patch(body: Partial<Me["user"]>, msg = "Saved") {
    const prev = me!;
    mutate("/api/me", { ...prev, user: { ...prev.user, ...body } }, false);
    try {
      await api("PATCH", "/api/me", body);
      toast(msg);
    } catch (e) {
      mutate("/api/me", prev, false);
      toast(e instanceof ApiError ? e.message : "Couldn't save.");
    }
    mutate("/api/me");
  }

  async function signOut() {
    setBusy(true);
    await api("POST", "/api/auth/signout").catch(() => {});
    try { localStorage.removeItem("hq-theme"); } catch {}
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <PageHead title="Settings" sub={u.email} />

      <div className="grid gap-5 md:grid-cols-2">
        <Panel>
          <div className="mb-4 flex items-center gap-4">
            <Avatar avatar={u.avatar} color={u.color} size={80} />
            <p className="text-2xl font-semibold">{u.name}</p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); patch({ name }, "Name updated"); }} className="grid gap-3">
            <Field label="Your name"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required className={inputCls} /></Field>
            <Button type="submit" variant="soft">Save name</Button>
          </form>
        </Panel>
        <Panel>
          <h2 className="mb-3 text-xl font-semibold">Avatar color</h2>
          <div className="flex flex-wrap gap-3">
            {(Object.keys(COLORS) as ColorKey[]).map((c) => (
              <button key={c} aria-label={`${c} color`} aria-pressed={u.color === c} onClick={() => patch({ color: c }, "Color updated")}
                className={clsx("h-12 w-12 rounded-full transition active:scale-90", u.color === c ? "ring-4 ring-ink/30 ring-offset-2 ring-offset-bg" : "hover:scale-110")}
                style={{ background: `var(--c-${c}-fg)` }} />
            ))}
          </div>
          <div className="mt-6 border-t border-line pt-4">
            <Button variant="danger" busy={busy} onClick={signOut}><LogOut className="h-5 w-5" />Sign out</Button>
          </div>
        </Panel>
      </div>

      <Panel>
        <h2 className="mb-1 text-2xl font-semibold">Avatar</h2>
        <p className="mb-4 text-muted">Shown next to your name for the whole family.</p>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {AVATARS.map((a) => (
            <button key={a.key} onClick={() => patch({ avatar: a.key }, "Avatar updated")} aria-pressed={u.avatar === a.key}
              className={clsx("tile-press flex flex-col items-center gap-2 rounded-[22px] bg-card p-3 shadow-soft", u.avatar === a.key && picked)}>
              <Avatar avatar={a.key} color={u.color} size={56} />
              <span className="text-[14px] font-semibold">{a.name}</span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel>
        <h2 className="mb-1 text-2xl font-semibold">Theme</h2>
        <p className="mb-4 text-muted">Changes the colors of your dashboard. Only you see your theme.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {THEMES.map((t) => (
            <button key={t.key} onClick={() => patch({ theme: t.key }, `${t.name} theme on`)} aria-pressed={u.theme === t.key}
              className={clsx("tile-press overflow-hidden rounded-[22px] bg-card text-left shadow-soft", u.theme === t.key && picked)}>
              <span className="relative block h-24" style={{ background: t.swatch[0] }} aria-hidden>
                <span className="absolute inset-x-5 top-5 grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((n) => <span key={n} className="h-12 rounded-xl shadow" style={{ background: n === 1 ? t.swatch[2] : t.swatch[1] }} />)}
                </span>
              </span>
              <span className="flex items-center gap-3 p-4">
                <span className="min-w-0 flex-1"><span className="block font-semibold">{t.name}</span><span className="block text-[14px] text-muted">{t.blurb}</span></span>
                {u.theme === t.key && <Check className="h-5 w-5 text-good" />}
              </span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel>
        <h2 className="mb-1 text-2xl font-semibold">Effect</h2>
        <p className="mb-4 text-muted">A little holiday magic on top of everything.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {EFFECTS.map((e) => (
            <button key={e.key} onClick={() => patch({ effect: e.key }, e.key === "none" ? "Effect off" : `${e.name} on`)} aria-pressed={u.effect === e.key}
              className={clsx("tile-press flex items-center gap-3 rounded-[22px] bg-card p-4 text-left shadow-soft", u.effect === e.key && picked)}>
              <span className="min-w-0 flex-1"><span className="block font-semibold">{e.name}</span><span className="block text-[14px] text-muted">{e.blurb}</span></span>
              {u.effect === e.key && <Check className="h-5 w-5 text-good" />}
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}
