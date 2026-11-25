"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR, { mutate } from "swr";
import clsx from "clsx";
import { ExternalLink, Gift, HandHeart, Plus, Search, Wand2 } from "lucide-react";
import { api, ApiError, centsFrom, fetcher } from "@/lib/client";
import { findIdeas, INTERESTS, VIBES, type Interest, type Vibe } from "@/lib/ideas";
import type { About, GiftsData, Person, WishRow } from "@/lib/types";
import { Avatar, Button, PageHead, Panel, Spinner, useToast } from "@/components/ui";
import { GiftForm } from "@/components/gift-form";

type ListData = { owner: Person & { about: About }; wishes: WishRow[] };

const KEYWORDS: Record<Interest, string[]> = {
  sports: ["basketball", "football", "soccer", "baseball", "sport", "hockey", "golf"],
  fitness: ["gym", "lift", "run", "workout", "fitness", "yoga"],
  gaming: ["gaming", "game", "xbox", "playstation", "nintendo", "switch"],
  music: ["music", "guitar", "concert", "vinyl", "sing"],
  tech: ["tech", "phone", "computer", "gadget"],
  fashion: ["fashion", "clothes", "shoes", "sneaker", "nike", "style"],
  beauty: ["skincare", "makeup", "beauty", "nails", "spa"],
  cooking: ["cook", "bake", "baking", "food", "kitchen"],
  coffee: ["coffee", "tea", "latte"],
  reading: ["read", "book"],
  art: ["art", "draw", "paint", "craft"],
  outdoors: ["hike", "camp", "outdoor", "fish", "hunt"],
  home: ["home", "room", "decor", "candle", "cozy"],
  travel: ["travel", "trip"],
  pets: ["dog", "cat", "pet"],
  movies: ["movie", "tv", "film", "show", "anime"],
};

export default function Finder() {
  const toast = useToast();
  const params = useSearchParams();
  const { data: gd } = useSWR<GiftsData>("/api/gifts", fetcher);
  const [who, setWho] = useState<string>(params.get("for") ?? "");
  const { data: list } = useSWR<ListData>(who ? `/api/wishes?user=${who}` : null, fetcher);
  const [max, setMax] = useState(75);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [vibe, setVibe] = useState<Vibe | null>(null);
  const [plan, setPlan] = useState<{ title: string; price: string } | null>(null);
  const [busy, setBusy] = useState("");

  const aboutText = list
    ? [list.owner.about?.into, list.owner.about?.brands, ...list.wishes.map((w) => `${w.title} ${w.category}`)].join(" ").toLowerCase()
    : "";
  useEffect(() => {
    if (!list) return;
    const guess = (Object.keys(KEYWORDS) as Interest[]).filter((k) => KEYWORDS[k].some((w) => aboutText.includes(w)));
    setInterests(guess.slice(0, 4));
  }, [list]); // eslint-disable-line react-hooks/exhaustive-deps

  const ideas = useMemo(() => findIdeas({ interests, vibe, max, aboutText }), [interests, vibe, max, aboutText]);
  const fromList = (list?.wishes ?? []).filter((w) => !w.claim && (!w.price || centsFrom(w.price) <= max * 100)).slice(0, 6);
  const person = gd?.people.find((p) => p.id === who);
  if (!gd) return <Spinner />;

  async function claim(w: WishRow) {
    setBusy(w.id);
    try {
      await api("POST", "/api/gifts", { recipient_id: who, wish_id: w.id, title: w.title, price_cents: centsFrom(w.price) });
      toast("Added to your gift plan. It's a secret!");
      mutate(`/api/wishes?user=${who}`);
      mutate("/api/gifts");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't claim it.");
    } finally {
      setBusy("");
    }
  }

  const toggle = (k: Interest) => setInterests((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]));
  const chip = (on: boolean) =>
    clsx("h-10 rounded-full px-4 text-[15px] font-medium transition active:scale-95", on ? "bg-accent text-onaccent shadow-soft" : "bg-card text-ink shadow-soft hover:shadow-pop");

  return (
    <div>
      <PageHead title="Gift Finder" sub="Answer a few questions and get ideas that fit the person and your budget." />
      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Panel className="content-start">
          <div className="grid gap-5">
            <div>
              <h2 className="mb-2 font-semibold">1. Who's it for?</h2>
              <div className="flex flex-wrap gap-2">
                {gd.people.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setWho(p.id)}
                    aria-pressed={who === p.id}
                    className={clsx("flex items-center gap-2 rounded-full border-2 py-1 pl-1 pr-3 transition", who === p.id ? "border-accent bg-accent/10" : "border-transparent bg-card shadow-soft")}
                  >
                    <Avatar avatar={p.avatar} color={p.color} size={30} />
                    {p.name}
                  </button>
                ))}
                <button onClick={() => setWho("")} aria-pressed={!who} className={chip(!who)}>Someone else</button>
              </div>
            </div>
            <div>
              <h2 className="mb-2 font-semibold">
                2. Spend up to <span className="tabular-nums text-accent">${max}{max === 300 ? "+" : ""}</span>
              </h2>
              <input type="range" min={10} max={300} step={5} value={max} onChange={(e) => setMax(Number(e.target.value))} className="w-full accent-[rgb(var(--accent))]" aria-label="Maximum price" />
            </div>
            <div>
              <h2 className="mb-2 font-semibold">3. What are they into?</h2>
              {person && interests.length > 0 && <p className="mb-2 text-[13px] text-muted">Picked from {person.name}'s list and About Me. Change anything.</p>}
              <div className="flex flex-wrap gap-2">
                {INTERESTS.map((i) => (
                  <button key={i.key} onClick={() => toggle(i.key)} aria-pressed={interests.includes(i.key)} className={chip(interests.includes(i.key))}>{i.label}</button>
                ))}
              </div>
            </div>
            <div>
              <h2 className="mb-2 font-semibold">4. What kind of gift?</h2>
              <div className="flex flex-wrap gap-2">
                {VIBES.map((v) => (
                  <button key={v.key} onClick={() => setVibe(vibe === v.key ? null : v.key)} aria-pressed={vibe === v.key} className={chip(vibe === v.key)}>{v.label}</button>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        <div className="grid content-start gap-5">
          {who && fromList.length > 0 && (
            <Panel>
              <h2 className="mb-3 text-xl font-semibold">From {person?.name}'s list, in budget</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {fromList.map((w) => (
                  <li key={w.id} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: "var(--c-red-bg)", color: "var(--c-red-fg)" }}><Gift /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{w.title}</p>
                      <p className="text-[13px] text-muted">{[w.price, w.size && `Size ${w.size}`].filter(Boolean).join(" · ") || (w.kind === "idea" ? "Gift idea" : "")}</p>
                    </div>
                    <Button size="sm" busy={busy === w.id} onClick={() => claim(w)}><HandHeart className="h-4 w-4" />Get</Button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel>
            <h2 className="mb-3 text-xl font-semibold">{interests.length || vibe ? "Ideas for them" : "Pick a few interests to see ideas"}</h2>
            {ideas.length === 0 ? (
              <p className="py-6 text-center text-muted">{interests.length || vibe ? "Nothing fits yet. Try a bigger budget or more interests." : "Tap what they're into on the left."}</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {ideas.map((idea, i) => (
                  <li key={idea.title} className="anim-rise flex flex-col rounded-[22px] bg-card p-4 shadow-soft" style={{ animationDelay: `${i * 40}ms` }}>
                    <span className="mb-2 grid h-11 w-11 place-items-center rounded-xl" style={{ background: "var(--c-purple-bg)", color: "var(--c-purple-fg)" }}><Wand2 className="h-5 w-5" /></span>
                    <p className="text-[17px] font-semibold leading-snug">{idea.title}</p>
                    <p className="mt-1 flex-1 text-[14px] text-muted">{idea.why}</p>
                    <p className="mt-2 text-[14px] font-semibold">{idea.low === idea.high ? `About $${idea.low}` : `About $${idea.low}–$${idea.high}`}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a
                        href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(idea.search)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink/[.06] px-3 text-[14px] font-medium hover:bg-ink/10"
                      >
                        <Search className="h-4 w-4" />Shop<ExternalLink className="h-3 w-3" />
                      </a>
                      {who && <Button size="sm" variant="soft" onClick={() => setPlan({ title: idea.title, price: String(idea.low) })}><Plus className="h-4 w-4" />Plan it</Button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-[13px] text-muted">Prices are typical ranges, not live store prices.</p>
          </Panel>
        </div>
      </div>
      {person && (
        <GiftForm
          open={!!plan}
          onClose={() => setPlan(null)}
          onSaved={() => mutate("/api/gifts")}
          people={[person]}
          preset={{ recipient_id: person.id, title: plan?.title, price: plan?.price }}
        />
      )}
    </div>
  );
}
