"use client";

import Link from "next/link";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

export type TileDef = { href: string; label: string; icon: LucideIcon; color: string; badge?: string | number };

export function Tile({ t, i = 0 }: { t: TileDef; i?: number }) {
  return (
    <Link
      href={t.href}
      className="tile-press anim-rise relative grid aspect-square place-items-center rounded-[22px] p-2 shadow-tile"
      style={{ background: `var(--c-${t.color}-bg)`, color: `var(--c-${t.color}-fg)`, animationDelay: `${i * 35}ms` }}
    >
      <span className="flex flex-col items-center gap-1.5 text-center sm:gap-2">
        <t.icon className="h-9 w-9 sm:h-12 sm:w-12" strokeWidth={2.2} />
        <span className="text-[14px] font-semibold leading-tight sm:text-[17px]">{t.label}</span>
      </span>
      {t.badge !== undefined && t.badge !== 0 && (
        <span className={clsx("absolute right-2 top-2 min-w-6 rounded-full bg-accent px-1.5 text-center text-[12px] font-semibold leading-6 text-onaccent shadow-soft")}>{t.badge}</span>
      )}
    </Link>
  );
}

export function TileGrid({ tiles }: { tiles: TileDef[] }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-5 lg:grid-cols-6">
      {tiles.map((t, i) => <Tile key={t.href + t.label} t={t} i={i} />)}
    </div>
  );
}
