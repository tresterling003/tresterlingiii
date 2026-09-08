"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { slug: "", label: "Overview" },
  { slug: "timeline", label: "Timeline" },
  { slug: "curriculum", label: "Curriculum" },
  { slug: "resources", label: "Resources" },
  { slug: "assignments", label: "Grading" },
  { slug: "students", label: "Students" },
  { slug: "import", label: "Import" },
];

export function ClassTabs({ classId, color }: { classId: string; color: string }) {
  const pathname = usePathname();
  const base = `/classes/${classId}`;

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-border px-8">
      {TABS.map((tab) => {
        const href = tab.slug ? `${base}/${tab.slug}` : base;
        const active = tab.slug ? pathname.startsWith(href) : pathname === base;
        return (
          <Link
            key={tab.slug}
            href={href}
            className="relative whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors"
            style={{ color: active ? color : "var(--color-muted)" }}
          >
            {tab.label}
            {active && (
              <span
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                style={{ backgroundColor: color }}
              />
            )}
          </Link>
        );
      })}
    </div>
  );
}
