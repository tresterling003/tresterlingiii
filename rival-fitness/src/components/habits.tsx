"use client";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { Beef, Droplet, Minus, Plus } from "lucide-react";
import { SectionHeader } from "./ui/states";
import { useToast } from "./ui/toast";
import { ACTIVITY_KEYS } from "@/lib/hooks";
import { api, ApiError } from "@/lib/client";
import type { TodayResponse } from "@/lib/solo-types";

/** Water glasses + protein grams for today. Saves as you tap. */
export function HabitsCard({ data }: { data: TodayResponse }) {
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const { settings } = data.habits;
  const [water, setWater] = useState(data.habits.today.water);
  const [protein, setProtein] = useState(data.habits.today.protein);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const dirty = useRef(false);

  useEffect(() => {
    if (dirty.current) return;
    setWater(data.habits.today.water);
    setProtein(data.habits.today.protein);
  }, [data.habits.today.water, data.habits.today.protein]);

  const save = (w: number, p: number) => {
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await api("POST", "/api/habits", { date: data.today, water: w, protein: p });
        dirty.current = false;
        mutate(ACTIVITY_KEYS);
      } catch (e) {
        toast({ kind: "error", title: "Couldn't save habits", body: e instanceof ApiError ? e.message : undefined });
      }
    }, 600);
  };
  const setW = (v: number) => { const n = Math.max(0, Math.min(60, v)); setWater(n); save(n, protein); };
  const setP = (v: number) => { const n = Math.max(0, Math.min(1000, v)); setProtein(n); save(water, n); };

  if (!settings.water_enabled && !settings.protein_enabled) return null;

  return (
    <section className="panel p-4 sm:p-6" data-testid="habits-card">
      <SectionHeader title="Daily habits" action={<span className="text-[11px] text-fg-faint">+3 pts each when you hit it</span>} />
      <div className="flex flex-col gap-6">
        {settings.water_enabled && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-semibold"><Droplet className="h-4 w-4 text-info" /> Water</p>
              <p className="tnum text-sm"><span className="font-display text-xl font-bold" data-testid="water-count">{water}</span><span className="text-fg-faint"> / {settings.water_target} glasses</span></p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setW(water - 1)} disabled={water === 0} aria-label="Remove a glass"
                className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-ink-750 text-fg-muted active:scale-90 disabled:opacity-30"><Minus className="h-4 w-4" /></button>
              <div className="flex flex-1 gap-1" aria-hidden="true">
                {Array.from({ length: settings.water_target }, (_, i) => (
                  <div key={i} className={clsx("h-8 flex-1 rounded-sm transition-colors", i < water ? "bg-info" : "bg-ink-700")} />
                ))}
              </div>
              <button onClick={() => setW(water + 1)} aria-label="Add a glass" data-testid="water-plus"
                className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-info text-ink-950 active:scale-90"><Plus className="h-5 w-5" strokeWidth={3} /></button>
            </div>
          </div>
        )}
        {settings.protein_enabled && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-semibold"><Beef className="h-4 w-4 text-warn" /> Protein</p>
              <p className="tnum text-sm"><span className="font-display text-xl font-bold" data-testid="protein-count">{protein}</span><span className="text-fg-faint"> / {settings.protein_target} g</span></p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink-700">
              <div className="h-full rounded-full bg-warn transition-[width] duration-500" style={{ width: `${Math.min(100, (protein / settings.protein_target) * 100)}%` }} />
            </div>
            <div className="mt-3 flex gap-2">
              {[10, 25, 40].map((g) => (
                <button key={g} onClick={() => setP(protein + g)} data-testid={`protein-plus-${g}`}
                  className="focus-ring h-10 flex-1 rounded-md border border-ink-600 text-sm font-semibold transition-colors hover:border-warn active:scale-95">+{g}g</button>
              ))}
              <button onClick={() => setP(protein - 10)} disabled={protein === 0} aria-label="Remove 10 grams"
                className="focus-ring h-10 w-12 rounded-md bg-ink-750 text-sm font-semibold text-fg-muted active:scale-95 disabled:opacity-30">−10</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
