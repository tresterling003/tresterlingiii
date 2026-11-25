"use client";

import { useEffect, useState } from "react";
import { api, ApiError, centsFrom } from "@/lib/client";
import type { GiftRow, Person } from "@/lib/types";
import { Avatar, Button, Field, Sheet, inputCls, useToast } from "./ui";

export const STATUS: { key: GiftRow["status"]; label: string; color: string }[] = [
  { key: "planned", label: "To buy", color: "#8A93A6" },
  { key: "bought", label: "Bought", color: "#3C7CC4" },
  { key: "wrapped", label: "Wrapped", color: "#7D5BC0" },
  { key: "given", label: "Given", color: "#2E8B57" },
];

/** Add or edit a gift you're giving (off-list or from a wish). */
export function GiftForm({
  open, onClose, onSaved, people, gift, preset,
}: {
  open: boolean; onClose: () => void; onSaved: () => void; people: Person[]; gift?: GiftRow | null;
  preset?: { recipient_id?: string; title?: string; price?: string; link?: string };
}) {
  const toast = useToast();
  const [f, setF] = useState({ recipient_id: "", title: "", price: "", link: "", notes: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    if (gift) setF({ recipient_id: gift.recipient_id, title: gift.title, price: gift.price_cents ? (gift.price_cents / 100).toString() : "", link: gift.link, notes: gift.notes });
    else setF({ recipient_id: preset?.recipient_id ?? people[0]?.id ?? "", title: preset?.title ?? "", price: preset?.price ?? "", link: preset?.link ?? "", notes: "" });
    // Reset only when the sheet opens or switches gift; parents pass fresh preset/people objects each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, gift?.id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { title: f.title, price_cents: centsFrom(f.price), link: f.link, notes: f.notes };
      if (gift) await api("PATCH", `/api/gifts/${gift.id}`, body);
      else await api("POST", "/api/gifts", { ...body, recipient_id: f.recipient_id });
      toast(gift ? "Gift updated" : "Added to your gift plan");
      onSaved();
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={gift ? "Edit gift" : "Plan a gift"}>
      <form onSubmit={save} className="grid gap-4 pb-2">
        {!gift && (
          <div className="grid gap-1.5">
            <span className="text-[15px] font-medium">For</span>
            {people.length === 0 ? <p className="text-muted">Join a family first to plan gifts.</p> : (
              <div className="flex flex-wrap gap-2">
                {people.map((p) => (
                  <button type="button" key={p.id} onClick={() => setF((x) => ({ ...x, recipient_id: p.id }))} aria-pressed={f.recipient_id === p.id}
                    className={"flex items-center gap-2 rounded-full border-2 py-1 pl-1 pr-3 transition " + (f.recipient_id === p.id ? "border-accent bg-accent/10" : "border-line bg-card")}>
                    <Avatar avatar={p.avatar} color={p.color} size={30} />{p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <Field label="Gift"><input required maxLength={120} value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} className={inputCls} placeholder="Cozy hoodie" /></Field>
        <Field label="Price"><input inputMode="decimal" value={f.price} onChange={(e) => setF((x) => ({ ...x, price: e.target.value }))} className={inputCls} placeholder="$45" /></Field>
        <Field label="Link (optional)"><input value={f.link} onChange={(e) => setF((x) => ({ ...x, link: e.target.value }))} className={inputCls} placeholder="https://" /></Field>
        <Field label="Notes (only you see these)"><textarea rows={2} maxLength={400} value={f.notes} onChange={(e) => setF((x) => ({ ...x, notes: e.target.value }))} className={inputCls} /></Field>
        <Button type="submit" busy={busy} disabled={!gift && !f.recipient_id}>{gift ? "Save" : "Add to plan"}</Button>
      </form>
    </Sheet>
  );
}
