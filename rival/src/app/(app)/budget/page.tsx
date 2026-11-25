"use client";

import { useEffect, useState } from "react";
import useSWR, { mutate as gmutate } from "swr";
import clsx from "clsx";
import { PiggyBank, Wand2 } from "lucide-react";
import { api, ApiError, centsFrom, fetcher } from "@/lib/client";
import { money } from "@/lib/catalog";
import type { GiftsData } from "@/lib/types";
import { Avatar, Button, Empty, ErrorBox, PageHead, Panel, Spinner, inputCls, useToast } from "@/components/ui";

export default function Budget() {
  const toast = useToast();
  const { data, error, mutate } = useSWR<GiftsData>("/api/gifts", fetcher);
  const [total, setTotal] = useState("");
  const [per, setPer] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setTotal(data.budget_cents ? String(data.budget_cents / 100) : "");
    setPer(Object.fromEntries(data.people.map((p) => [p.id, String((data.budgets.find((b) => b.recipient_id === p.id)?.cents ?? 0) / 100 || "")])));
  }, [data]);

  if (error) return <ErrorBox message={error.message} retry={() => mutate()} />;
  if (!data) return <Spinner />;

  const spentFor = (id: string) => data.gifts.filter((g) => g.recipient_id === id).reduce((s, g) => s + g.price_cents, 0);
  const spent = data.gifts.reduce((s, g) => s + g.price_cents, 0);
  const totalC = centsFrom(total);
  const allocated = Object.values(per).reduce((s, v) => s + centsFrom(v), 0);
  const left = totalC - spent;

  function split() {
    if (!totalC || !data!.people.length) return;
    const each = Math.floor(totalC / data!.people.length / 100);
    setPer(Object.fromEntries(data!.people.map((p) => [p.id, String(each)])));
  }

  async function save() {
    setBusy(true);
    try {
      await api("PATCH", "/api/me", { budget_cents: totalC });
      for (const p of data!.people) await api("PUT", "/api/budgets", { recipient_id: p.id, cents: centsFrom(per[p.id] ?? "") });
      await mutate();
      gmutate("/api/me");
      toast("Budget saved");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHead title="Budget" sub="Set what you want to spend, then see how you're doing as you plan gifts. Only you see this." />
      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Panel className="content-start">
          <div className="grid gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "var(--c-gold-bg)", color: "var(--c-gold-fg)" }}><PiggyBank className="h-8 w-8" /></span>
            <label className="grid gap-1.5">
              <span className="font-medium">Total Christmas budget</span>
              <input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="$500" className={inputCls + " text-2xl font-semibold"} />
            </label>
            <div className="rounded-2xl bg-card p-4 shadow-soft">
              <p className="text-[14px] text-muted">Planned so far</p>
              <p className="text-4xl font-semibold tabular-nums">{money(spent)}</p>
              {totalC > 0 && (
                <>
                  <div className="my-3 h-3 overflow-hidden rounded-full bg-ink/10">
                    <span className={clsx("block h-full rounded-full transition-all", spent > totalC ? "bg-accent" : "bg-good")} style={{ width: `${Math.min(100, (spent / totalC) * 100)}%` }} />
                  </div>
                  <p className={clsx("font-medium", left < 0 ? "text-accent" : "text-good")}>{left < 0 ? `${money(-left)} over budget` : `${money(left)} left to spend`}</p>
                </>
              )}
            </div>
            {totalC > 0 && allocated > 0 && allocated !== totalC && (
              <p className="text-[14px] text-muted">Per-person budgets add up to {money(allocated)}, {allocated > totalC ? "more" : "less"} than your total.</p>
            )}
            <Button busy={busy} onClick={save}>Save budget</Button>
          </div>
        </Panel>
        <Panel>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">Per person</h2>
            {data.people.length > 0 && <Button size="sm" variant="soft" onClick={split} disabled={!totalC}><Wand2 className="h-4 w-4" />Split evenly</Button>}
          </div>
          {data.people.length === 0 ? <Empty icon={PiggyBank} title="No family yet">Join or start a family to budget for each person.</Empty> : (
            <ul className="grid gap-3">
              {data.people.map((p) => {
                const s = spentFor(p.id);
                const b = centsFrom(per[p.id] ?? "");
                return (
                  <li key={p.id} className="rounded-2xl bg-card p-3 shadow-soft">
                    <div className="flex items-center gap-3">
                      <Avatar avatar={p.avatar} color={p.color} size={40} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{p.name}</p>
                        <p className={clsx("text-[14px]", b && s > b ? "text-accent" : "text-muted")}>{money(s)} planned{b ? ` · ${s > b ? money(s - b) + " over" : money(b - s) + " left"}` : ""}</p>
                      </div>
                      <input aria-label={`Budget for ${p.name}`} inputMode="decimal" value={per[p.id] ?? ""} onChange={(e) => setPer((x) => ({ ...x, [p.id]: e.target.value }))} placeholder="$0" className={inputCls + " w-28 text-right"} />
                    </div>
                    {b > 0 && (
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/10">
                        <span className={clsx("block h-full rounded-full", s > b ? "bg-accent" : "bg-good")} style={{ width: `${Math.min(100, (s / b) * 100)}%` }} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
