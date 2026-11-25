"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR, { mutate } from "swr";
import { ClipboardPaste, ListChecks, Pencil, Plus, UserRound } from "lucide-react";
import { api, ApiError, fetcher } from "@/lib/client";
import { useMe } from "@/lib/hooks";
import type { About, WishRow } from "@/lib/types";
import { Button, Empty, ErrorBox, Field, PageHead, Segmented, Sheet, Spinner, inputCls, useToast } from "@/components/ui";
import { AboutCard, WishCard, WishEditor } from "@/components/wish";

type ListData = { owner: { id: string; name: string; about: About }; mine: boolean; wishes: WishRow[] };

export default function MyList() {
  const params = useSearchParams();
  const toast = useToast();
  const { data: me } = useMe();
  const { data, error, mutate: reload } = useSWR<ListData>("/api/wishes", fetcher);
  const [editing, setEditing] = useState<WishRow | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "exact" | "idea">("all");

  useEffect(() => {
    if (params.get("import")) setImportOpen(true);
  }, [params]);

  const refresh = () => { reload(); mutate("/api/me"); };
  if (error) return <ErrorBox message={error.message} retry={() => reload()} />;
  if (!data || !me) return <Spinner />;

  const shown = data.wishes.filter((w) => filter === "all" || w.kind === filter);
  const needs = data.wishes.filter((w) => w.kind === "exact" && !w.size && !w.links.length).length;

  return (
    <div>
      <PageHead title="My Wishlist" sub={`${data.wishes.length} ${data.wishes.length === 1 ? "wish" : "wishes"}. Everyone in your family sees this list.`}>
        <Button variant="soft" onClick={() => setImportOpen(true)}><ClipboardPaste className="h-5 w-5" />Paste from Notes</Button>
        <Button onClick={() => { setEditing(null); setEditorOpen(true); }}><Plus className="h-5 w-5" />Add wish</Button>
      </PageHead>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="order-2 lg:order-1">
          {data.wishes.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="w-full max-w-sm"><Segmented label="Filter" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "exact", label: "Exact picks" }, { value: "idea", label: "Gift ideas" }]} /></div>
              {needs > 0 && <span className="text-[14px] font-medium text-[#B86E00]">{needs} {needs === 1 ? "wish needs" : "wishes need"} a size or link</span>}
            </div>
          )}
          {data.wishes.length === 0 ? (
            <Empty icon={ListChecks} title="Your list is empty">
              <p>Add wishes one at a time, or paste your whole list from Notes and fill in the details after.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button onClick={() => { setEditing(null); setEditorOpen(true); }}><Plus className="h-5 w-5" />Add wish</Button>
                <Button variant="soft" onClick={() => setImportOpen(true)}>Paste from Notes</Button>
              </div>
            </Empty>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((w, i) => (
                <WishCard key={w.id} w={w} i={i} footer={
                  <Button variant="soft" size="sm" onClick={() => { setEditing(w); setEditorOpen(true); }}><Pencil className="h-4 w-4" />Edit</Button>
                } />
              ))}
            </div>
          )}
        </div>
        <aside className="order-1 grid content-start gap-3 lg:order-2">
          <AboutCard about={data.owner.about} name="me" />
          <Button variant="soft" onClick={() => setAboutOpen(true)}><UserRound className="h-5 w-5" />{Object.keys(data.owner.about ?? {}).length ? "Edit About Me" : "Add sizes & favorites"}</Button>
          <p className="px-2 text-[14px] text-muted">Your sizes and favorites help family pick gifts even when they go off-list.</p>
        </aside>
      </div>

      <WishEditor open={editorOpen} wish={editing} onClose={() => setEditorOpen(false)} onSaved={refresh} />
      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} onDone={(n) => { toast(`${n} ${n === 1 ? "wish" : "wishes"} added. Tap Edit to add details.`); refresh(); }} />
      <AboutSheet open={aboutOpen} about={data.owner.about ?? {}} onClose={() => setAboutOpen(false)} onSaved={refresh} />
    </div>
  );
}

function ImportSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (n: number) => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ added: number }>("POST", "/api/wishes/import", { text });
      setText("");
      onClose();
      onDone(r.added);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't import.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Paste from Notes">
      <form onSubmit={go} className="grid gap-4 pb-2">
        <p className="text-muted">Copy your list out of Notes and paste it here. Each line becomes a wish. Start a line with <b className="text-ink">idea:</b> to make it a gift idea.</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} required className={inputCls} placeholder={"Nike Tech Fleece joggers\nDunks\nidea: stuff for my room"} />
        <Button type="submit" busy={busy}>Add to my list</Button>
      </form>
    </Sheet>
  );
}

function AboutSheet({ open, about, onClose, onSaved }: { open: boolean; about: About; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ note: "", sizes: "", colors: "", brands: "", into: "", skip: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setF({ note: about.note ?? "", sizes: (about.sizes ?? []).join("\n"), colors: about.colors ?? "", brands: about.brands ?? "", into: about.into ?? "", skip: about.skip ?? "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("PATCH", "/api/me", { about: { ...f, sizes: f.sizes.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 12) } });
      toast("About Me saved");
      onSaved();
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="About me" footer={<Button type="submit" form="about-form" busy={busy} className="w-full">Save</Button>}>
      <form id="about-form" onSubmit={save} className="grid gap-4 pb-2">
        <Field label="A note to your family"><textarea rows={2} maxLength={300} value={f.note} onChange={set("note")} className={inputCls} placeholder="Everything here is a guide. Surprise me!" /></Field>
        <Field label="My sizes" hint={'One per line, like "Shoe: 10.5"'}><textarea rows={4} value={f.sizes} onChange={set("sizes")} className={inputCls} placeholder={"Shirt: M\nPants: 32x30\nShoe: 10.5"} /></Field>
        <Field label="Colors I like"><input maxLength={120} value={f.colors} onChange={set("colors")} className={inputCls} /></Field>
        <Field label="Brands and stores I like"><input maxLength={160} value={f.brands} onChange={set("brands")} className={inputCls} /></Field>
        <Field label="Things I'm into lately"><input maxLength={200} value={f.into} onChange={set("into")} className={inputCls} /></Field>
        <Field label="Please skip"><input maxLength={160} value={f.skip} onChange={set("skip")} className={inputCls} /></Field>
      </form>
    </Sheet>
  );
}
