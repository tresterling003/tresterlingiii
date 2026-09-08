"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { withAlpha } from "@/lib/utils/color";

export interface SidebarClass {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export function Sidebar({ classes }: { classes: SidebarClass[] }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-64 flex-shrink-0 flex-col border-r border-border bg-white/70 px-4 py-5">
      <Link href="/" className="mb-6 flex items-center gap-2 px-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-lg text-white">
          🎒
        </span>
        <span className="text-sm font-bold tracking-tight text-ink">Classroom HQ</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        <SidebarLink href="/" active={pathname === "/"} icon="🏠" label="Home" />

        <p className="mb-1 mt-5 px-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Your classes
        </p>
        {classes.length === 0 && (
          <p className="px-2 text-sm text-muted">No classes yet</p>
        )}
        {classes.map((c) => {
          const active = pathname.startsWith(`/classes/${c.id}`);
          return (
            <Link
              key={c.id}
              href={`/classes/${c.id}`}
              className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors"
              style={{
                backgroundColor: active ? withAlpha(c.color, "1f") : "transparent",
                color: active ? c.color : "var(--color-ink)",
              }}
            >
              <span
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-sm"
                style={{ backgroundColor: withAlpha(c.color, "26") }}
              >
                {c.emoji}
              </span>
              <span className="truncate">{c.name}</span>
            </Link>
          );
        })}
        <Link
          href="/classes/new"
          className="mt-1 flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-black/5 hover:text-ink"
        >
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-sm">
            +
          </span>
          Add class
        </Link>
      </nav>

      <button
        onClick={logout}
        className="mt-4 rounded-xl px-2.5 py-2 text-left text-sm font-medium text-muted transition-colors hover:bg-black/5 hover:text-ink"
      >
        Sign out
      </button>
    </aside>
  );
}

function SidebarLink({
  href,
  active,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors ${
        active ? "bg-ink text-white" : "text-ink hover:bg-black/5"
      }`}
    >
      <span className="text-base leading-none">{icon}</span>
      {label}
    </Link>
  );
}
