"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Camera, ExternalLink, Gift, Lightbulb, Star, Trash2 } from "lucide-react";
import { api, ApiError, host, shrinkImage } from "@/lib/client";
import type { About, WishRow } from "@/lib/types";
import { Button, Field, Segmented, Sheet, Switch, inputCls, useToast } from "./ui";

const PALETTE = ["red", "green", "blue", "gold", "purple", "teal", "pink", "orange"];
const colorFor = (s: string) => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];

export function WishCard({ w, footer, i = 0 }: { w: WishRow; footer?: ReactNode; i?: number }) {
  const c = colorFor(w.title);
  const spec = [w.size && `Size ${w.size}`, w.color].filter(Boolean).join(" · ");
  return (
    <article className="anim-rise group flex flex-col overflow-hidden rounded-[24px] bg-card shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-pop" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
      <div className="relative">
        {w.image_id ? (
          <div className="aspect-[4/3] overflow-hidden bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/images/${w.image_id}`} alt={w.title} loading="lazy" className="h-full w-full object-contain p-3 transition duration-500 group-hover:scale-105" />
          </div>
        ) : (
          <div className="grid h-28 place-items-center" style={{ background: `var(--c-${c}-bg)`, color: `var(--c-${c}-fg)` }}>
            {w.kind === "idea" ? <Lightbulb className="h-10 w-10" /> : <Gift className="h-10 w-10" />}
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className={clsx("rounded-full px-2.5 py-1 text-[12px] font-semibold shadow-soft", w.kind === "idea" ? "bg-card text-ink" : "bg-ink text-bg")}>
            {w.kind === "idea" ? "Gift idea" : "Exact pick"}
          </span>
          {w.top && <span className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[12px] font-semibold text-onaccent shadow-soft"><Star className="h-3 w-3 fill-current" />Top wish</span>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        {w.brand && <span className="text-[13px] font-semibold text-accent">{w.brand}</span>}
        <h3 className="text-[19px] font-semibold leading-snug">{w.title}</h3>
        {spec && <p className="text-[15px] text-muted">{spec}</p>}
        {w.notes && <p className="text-[15px] leading-relaxed">{w.notes}</p>}
        {(w.price || w.links.length > 0) && (
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
            {w.price && <span className="font-semibold">{w.price}</span>}
            {w.links.map((u, n) => (
              <a key={n} href={u} target="_blank" rel="noopener noreferrer" className={clsx("inline-flex items-center gap-1.5 font-medium", n === 0 ? "h-9 rounded-full bg-accent px-4 text-[14px] text-onaccent transition hover:brightness-110" : "text-[14px] text-accent")}>
                {n === 0 ? "Shop at " : ""}{host(u)} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ))}
          </div>
        )}
        {footer && <div className="mt-2 border-t border-dashed border-line pt-3">{footer}</div>}
      </div>
    </article>
  );
}

export function AboutCard({ about, name }: { about: About; name: string }) {
  const sizes = (about.sizes ?? []).filter(Boolean);
  const rows: [string, string | undefined][] = [["Colors", about.colors], ["Brands", about.brands], ["Into lately", about.into], ["Please skip", about.skip]];
  const shown = rows.filter((r) => r[1]);
  if (!sizes.length && !shown.length && !about.note) return null;
  return (
    <section className="anim-rise rounded-[24px] bg-card p-5 shadow-soft">
      <h2 className="mb-3 text-xl font-semibold">About {name}</h2>
      {about.note && <p className="mb-3 text-[16px]">{about.note}</p>}
      {sizes.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {sizes.map((s, i) => {
            const k = s.indexOf(":");
            return (
              <span key={i} className="rounded-2xl px-3 py-2" style={{ background: "var(--c-green-bg)", color: "var(--c-green-fg)" }}>
                {k > 0 ? <><span className="text-[13px] opacity-80">{s.slice(0, k)}</span> <b className="text-[17px]">{s.slice(k + 1).trim()}</b></> : <b>{s}</b>}
              </span>
            );
          })}
        </div>
      )}
      {shown.length > 0 && (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-[15px]">
          {shown.map(([k, v]) => (
            <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      )}
    </section>
  );
}

const blank = { kind: "exact" as "exact" | "idea", top: false, title: "", brand: "", category: "", price: "", size: "", color: "", links: [] as string[], notes: "", image_id: null as string | null };

export function WishEditor({ open, wish, onClose, onSaved }: { open: boolean; wish: WishRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState(blank);
  const [links, setLinks] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const w = wish ?? blank;
    setF({ kind: w.kind, top: w.top, title: w.title, brand: w.brand, category: w.category, price: w.price, size: w.size, color: w.color, links: w.links, notes: w.notes, image_id: w.image_id });
    setLinks(w.links.join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, wish?.id]);

  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function upload(file: File) {
    setUploading(true);
    try {
      const blob = await shrinkImage(file);
      const r = await api<{ id: string }>("POST", "/api/images", undefined, blob);
      setF((x) => ({ ...x, image_id: r.id }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...f, links: links.split(/\s+/).filter(Boolean).slice(0, 5) };
      if (wish) await api("PATCH", `/api/wishes/${wish.id}`, body);
      else await api("POST", "/api/wishes", body);
      toast(wish ? "Wish updated" : "Wish added");
      onSaved();
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!wish) return;
    setBusy(true);
    try {
      await api("DELETE", `/api/wishes/${wish.id}`);
      toast("Wish deleted");
      onSaved();
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't delete.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={wish ? "Edit wish" : "New wish"}
      footer={
        <div className="flex items-center gap-2">
          {wish && <Button type="button" variant="danger" onClick={remove} disabled={busy}><Trash2 className="h-4 w-4" />Delete</Button>}
          <Button type="submit" form="wish-form" busy={busy} disabled={uploading} className="ml-auto">{wish ? "Save" : "Add wish"}</Button>
        </div>
      }
    >
      <form id="wish-form" onSubmit={save} className="grid gap-4 pb-2">
        <Segmented label="Kind of wish" value={f.kind} onChange={(v) => setF((x) => ({ ...x, kind: v }))} options={[{ value: "exact", label: "Exact pick" }, { value: "idea", label: "Gift idea" }]} />
        <p className="-mt-2 text-[13px] text-muted">{f.kind === "exact" ? "A specific thing you want. Add the size, color and a link." : "A starting point. Your family picks something they think you'd love."}</p>
        <Field label="What is it?"><input required maxLength={120} value={f.title} onChange={set("title")} className={inputCls} placeholder={f.kind === "exact" ? "Tech Fleece joggers" : "Something for the gym"} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand or store"><input maxLength={60} value={f.brand} onChange={set("brand")} className={inputCls} placeholder="Nike" /></Field>
          <Field label="Price"><input maxLength={30} value={f.price} onChange={set("price")} className={inputCls} placeholder="$110" /></Field>
          <Field label="Size"><input maxLength={40} value={f.size} onChange={set("size")} className={inputCls} placeholder="M" /></Field>
          <Field label="Color"><input maxLength={60} value={f.color} onChange={set("color")} className={inputCls} placeholder="Black" /></Field>
        </div>
        <Switch label="Top wish" checked={f.top} onChange={(v) => setF((x) => ({ ...x, top: v }))} />
        <Field label="Links to buy it" hint="Copy the link from the store's page. One per line, up to 5.">
          <textarea value={links} onChange={(e) => setLinks(e.target.value)} rows={2} className={inputCls} placeholder="https://www.nike.com/..." />
        </Field>
        <div className="grid gap-1.5">
          <span className="text-[15px] font-medium">Photo</span>
          <div className="flex items-center gap-3">
            {f.image_id && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/images/${f.image_id}`} alt="" className="h-16 w-16 rounded-2xl bg-white object-contain shadow-soft" />
            )}
            <Button type="button" variant="soft" size="sm" busy={uploading} onClick={() => fileRef.current?.click()}><Camera className="h-4 w-4" />{f.image_id ? "Change photo" : "Add a photo"}</Button>
            {f.image_id && <Button type="button" variant="danger" size="sm" onClick={() => setF((x) => ({ ...x, image_id: null }))}>Remove</Button>}
            <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file); e.target.value = ""; }} />
          </div>
          <span className="text-[13px] text-muted">Screenshot the product on your phone, then add it here.</span>
        </div>
        <Field label="Details for whoever shops"><textarea maxLength={600} rows={3} value={f.notes} onChange={set("notes")} className={inputCls} placeholder="Fit, style, what I already have…" /></Field>

      </form>
    </Sheet>
  );
}
