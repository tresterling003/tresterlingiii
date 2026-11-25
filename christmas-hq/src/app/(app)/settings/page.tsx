"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import clsx from "clsx";
import { LogOut, ShoppingBag } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { useMe } from "@/lib/hooks";
import { COLORS, type ColorKey } from "@/lib/catalog";
import { Avatar, Button, Field, PageHead, Panel, Spinner, inputCls, useToast } from "@/components/ui";

export default function Settings() {
  const { data: me } = useMe();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (me) setName(me.user.name); }, [me?.user.name]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me) return <Spinner />;

  async function patch(body: object, msg = "Saved") {
    try {
      await api("PATCH", "/api/me", body);
      await mutate("/api/me");
      toast(msg);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't save.");
    }
  }
  async function signOut() {
    setBusy(true);
    await api("POST", "/api/auth/signout").catch(() => {});
    try { localStorage.removeItem("hq-theme"); } catch {}
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <div className="grid gap-5">
      <PageHead title="Customize" sub={me.user.email} />
      <div className="grid gap-5 md:grid-cols-2">
        <Panel>
          <div className="mb-4 flex items-center gap-4">
            <Avatar avatar={me.user.avatar} color={me.user.color} size={80} />
            <div>
              <p className="text-2xl font-semibold">{me.user.name}</p>
              <Link href="/shop" className="inline-flex items-center gap-1.5 font-medium text-accent"><ShoppingBag className="h-4 w-4" />More avatars, themes and effects</Link>
            </div>
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
              <button key={c} aria-label={c} aria-pressed={me.user.color === c} onClick={() => patch({ color: c }, "Color updated")}
                className={clsx("h-12 w-12 rounded-full transition active:scale-90", me.user.color === c ? "ring-4 ring-ink/30 ring-offset-2 ring-offset-bg" : "hover:scale-110")}
                style={{ background: `var(--c-${c}-fg)` }} />
            ))}
          </div>
          <p className="mt-5 text-muted">Themes, effects and avatars are in the <Link href="/shop" className="font-medium text-accent">Shop</Link>. Earn coins by playing games.</p>
          <div className="mt-6 border-t border-line pt-4">
            <Button variant="danger" busy={busy} onClick={signOut}><LogOut className="h-5 w-5" />Sign out</Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
