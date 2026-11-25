"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import clsx from "clsx";
import { ExternalLink, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { api, ApiError, fetcher, host } from "@/lib/client";
import { money } from "@/lib/catalog";
import type { GiftRow, GiftsData } from "@/lib/types";
import { Avatar, Button, Empty, ErrorBox, PageHead, Panel, Segmented, Spinner, useToast } from "@/components/ui";
import { GiftForm, STATUS } from "@/components/gift-form";

export default function Gifts() {
  const toast = useToast();
  const { data, error, mutate } = useSWR<GiftsData>("/api/gifts", fetcher);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GiftRow | null>(null);
  const [filter, setFilter] = useState<"all" | GiftRow["status"]>("all");

  if (error) return <ErrorBox message={error.message} retry={() => mutate()} />;
  if (!data) return <Spinner />;

  async function setStatus(g: GiftRow, status: GiftRow["status"]) {
    mutate({ ...data!, gifts: data!.gifts.map((x) => (x.id === g.id ? { ...x, status } : x)) }, false);
    try {
      await api("PATCH", `/api/gifts/${g.id}`, { status });
      if (status === "given") toast("Marked as given. Merry Christmas!");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't update.");
    }
    mutate();
  }
  async function remove(g: GiftRow) {
    try {
      await api("DELETE", `/api/gifts/${g.id}`);
      mutate();
      toast(`Removed ${g.title}`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't remove.");
    }
  }

  const counts = Object.fromEntries(STATUS.map((s) => [s.key, data.gifts.filter((g) => g.status === s.key).length]));
  const total = data.gifts.reduce((s, g) => s + g.price_cents, 0);
  const byPerson = data.people
    .map((p) => ({ p, gifts: data.gifts.filter((g) => g.recipient_id === p.id && (filter === "all" || g.status === filter)), budget: data.budgets.find((b) => b.recipient_id === p.id)?.cents ?? 0, spent: data.gifts.filter((g) => g.recipient_id === p.id).reduce((s, g) => s + g.price_cents, 0) }))
    .filter((x) => x.gifts.length || filter === "all");

  return (
    <div>
      <PageHead title="Gift Tracker" sub="Only you can see this page.">
        <Link href="/budget" className="inline-flex h-11 items-center rounded-full bg-card px-5 font-medium shadow-soft transition hover:shadow-pop">Budget</Link>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-5 w-5" />Plan a gift</Button>
      </PageHead>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STATUS.map((s) => (
          <div key={s.key} className="anim-rise rounded-[22px] bg-card p-4 shadow-soft">
            <p className="text-[14px] text-muted">{s.label}</p>
            <p className="text-3xl font-semibold tabular-nums" style={{ color: s.color }}>{counts[s.key]}</p>
          </div>
        ))}
        <div className="anim-rise col-span-2 rounded-[22px] bg-card p-4 shadow-soft sm:col-span-1">
          <p className="text-[14px] text-muted">Total</p>
          <p className={clsx("text-3xl font-semibold tabular-nums", data.budget_cents && total > data.budget_cents && "text-accent")}>{money(total)}</p>
          {data.budget_cents > 0 && <p className="text-[13px] text-muted">of {money(data.budget_cents)}</p>}
        </div>
      </div>

      {data.gifts.length === 0 ? (
        <Empty icon={Package} title="No gifts planned yet">
          Open someone's list in <Link className="font-medium text-accent" href="/family">Family</Link> and tap <b>I'll get this</b>, or plan an off-list gift.
        </Empty>
      ) : (
        <>
          <div className="mb-4 max-w-xl"><Segmented label="Show" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, ...STATUS.map((s) => ({ value: s.key, label: s.label }))]} /></div>
          <div className="grid gap-4 lg:grid-cols-2">
            {byPerson.map(({ p, gifts, budget, spent }) => (
              <Panel key={p.id}>
                <div className="mb-3 flex items-center gap-3">
                  <Avatar avatar={p.avatar} color={p.color} size={44} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/family/${p.id}`} className="block truncate text-xl font-semibold hover:underline">{p.name}</Link>
                    <p className="text-[14px] text-muted">{money(spent)}{budget ? ` of ${money(budget)}` : ""}</p>
                  </div>
                </div>
                {budget > 0 && (
                  <div className="mb-3 h-2 overflow-hidden rounded-full bg-ink/10">
                    <span className={clsx("block h-full rounded-full", spent > budget ? "bg-accent" : "bg-good")} style={{ width: `${Math.min(100, (spent / budget) * 100)}%` }} />
                  </div>
                )}
                {gifts.length === 0 ? <p className="text-[15px] text-muted">Nothing yet.</p> : (
                  <ul className="grid gap-2">
                    {gifts.map((g) => (
                      <li key={g.id} className="rounded-2xl bg-card p-3 shadow-soft">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold">{g.title}</p>
                            <p className="text-[14px] text-muted">
                              {g.price_cents ? money(g.price_cents) : "No price"}{g.wish_id ? " · from their list" : ""}
                              {g.link && <> · <a className="inline-flex items-center gap-1 text-accent" href={g.link} target="_blank" rel="noopener noreferrer">{host(g.link)}<ExternalLink className="h-3 w-3" /></a></>}
                            </p>
                            {g.notes && <p className="mt-1 text-[14px]">{g.notes}</p>}
                          </div>
                          <button aria-label={`Edit ${g.title}`} onClick={() => { setEditing(g); setFormOpen(true); }} className="grid h-9 w-9 place-items-center rounded-full hover:bg-ink/5"><Pencil className="h-4 w-4" /></button>
                          <button aria-label={`Remove ${g.title}`} onClick={() => remove(g)} className="grid h-9 w-9 place-items-center rounded-full text-accent hover:bg-accent/10"><Trash2 className="h-4 w-4" /></button>
                        </div>
                        <div className="mt-2 flex gap-1 rounded-full bg-ink/[.05] p-1" role="radiogroup" aria-label="Status">
                          {STATUS.map((s) => (
                            <button key={s.key} role="radio" aria-checked={g.status === s.key} onClick={() => setStatus(g, s.key)}
                              className={clsx("h-8 flex-1 rounded-full text-[13px] font-medium transition", g.status === s.key ? "text-white shadow-soft" : "text-muted hover:text-ink")}
                              style={g.status === s.key ? { background: s.color } : undefined}>{s.label}</button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            ))}
          </div>
        </>
      )}
      <GiftForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={() => mutate()} people={data.people} gift={editing} />
    </div>
  );
}
