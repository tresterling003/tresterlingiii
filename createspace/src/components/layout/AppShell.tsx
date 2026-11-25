import { ArrowRight, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { LogoMark } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { UPDATES } from '@/data/updates';
import { cn } from '@/lib/cn';
import { useFavorites } from '@/state/FavoritesProvider';
import { CATEGORY_LINKS, TABS } from './navigation';

const roundButton =
  'grid size-11 shrink-0 place-items-center rounded-full bg-surface text-fg shadow-card transition-[transform,background-color] duration-150 hover:bg-surface-2 active:scale-95';

/** Pill-shaped top bar: logo, latest-update pill, theme and settings buttons. */
function TopBar() {
  const latest = UPDATES[0];
  return (
    <header className="mx-auto flex w-full max-w-[960px] items-center gap-2.5 px-4 pt-4 sm:gap-3 sm:px-6 sm:pt-6">
      <Link
        to="/"
        aria-label="CreateSpace home"
        className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-surface pr-4 pl-1.5 shadow-card transition-transform active:scale-[0.97]"
      >
        <LogoMark className="size-8" />
        <span className="text-[1.0625rem] font-extrabold tracking-tight">
          Create<span className="font-semibold">Space</span>
        </span>
      </Link>

      <Link
        to="/whats-new"
        className="group hidden h-11 min-w-0 flex-1 items-center gap-3 rounded-full bg-surface pr-3 pl-4 text-sm text-muted shadow-card transition-colors hover:text-fg md:flex"
      >
        <span className="size-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />
        <span className="truncate">
          <span className="font-bold text-fg">New in v{latest.version}:</span> {latest.highlights[0]}
        </span>
        <ArrowRight className="ml-auto size-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>

      <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
        <ThemeToggle className={roundButton} />
        <Link to="/settings" aria-label="Settings" title="Settings" className={roundButton}>
          <Settings className="size-[18px]" aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}

/** Bottom tab bar (all screen sizes) with a pop-up sheet for categories. */
function TabBar() {
  const { pathname } = useLocation();
  const { ids } = useFavorites();
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const sheetButton = useRef<HTMLButtonElement>(null);

  useEffect(() => setSheetOpen(false), [pathname]);

  // While the sheet is open: Escape closes it and focus moves into it.
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheetOpen(false);
    document.addEventListener('keydown', onKey);
    sheet.current?.querySelector<HTMLElement>('a')?.focus();
    const button = sheetButton.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      button?.focus();
    };
  }, [sheetOpen]);

  const tabClass = (active: boolean) =>
    cn(
      'relative flex h-14 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[0.6875rem] font-bold transition-colors duration-150 sm:text-xs',
      active ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg',
    );

  return (
    <>
      {sheetOpen && (
        <div className="fixed inset-0 z-40" aria-hidden="false">
          <div className="absolute inset-0 animate-fade-in bg-black/25" onClick={() => setSheetOpen(false)} aria-hidden="true" />
          <div
            ref={sheet}
            id="categories-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Categories"
            className="panel absolute inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] mx-auto max-w-md animate-fade-up p-3"
          >
            <ul className="grid gap-1">
              {CATEGORY_LINKS.map((c) => {
                const active = c.match(pathname);
                const Icon = c.icon;
                return (
                  <li key={c.id}>
                    <Link
                      to={c.to}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex h-12 items-center gap-3 rounded-2xl px-3 font-bold transition-colors',
                        active ? 'bg-surface-2' : 'hover:bg-surface-2',
                      )}
                    >
                      <span className="grid size-8 place-items-center rounded-xl bg-surface shadow-card">
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      {c.navLabel}
                      <span className="ml-auto text-sm font-semibold text-muted tabular-nums">{c.count}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm">
        <nav aria-label="Main" className="mx-auto flex max-w-[960px] gap-1 px-2 py-1.5">
          {TABS.map((tab) => {
            const active = tab.match(pathname);
            const Icon = tab.icon;
            const inner = (
              <>
                <Icon className="size-5" aria-hidden="true" strokeWidth={2.2} />
                <span className="max-w-full truncate px-0.5">{tab.label}</span>
                {tab.to === '/favorites' && ids.length > 0 && (
                  <span
                    className="absolute top-1.5 left-[calc(50%+6px)] grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[0.625rem] font-extrabold text-white tabular-nums"
                    aria-label={`${ids.length} saved`}
                  >
                    {ids.length}
                  </span>
                )}
              </>
            );
            return tab.to === 'categories' ? (
              <button
                key={tab.label}
                ref={sheetButton}
                type="button"
                onClick={() => setSheetOpen((o) => !o)}
                aria-expanded={sheetOpen}
                aria-controls="categories-sheet"
                className={tabClass(active || sheetOpen)}
              >
                {inner}
              </button>
            ) : (
              <Link key={tab.label} to={tab.to} aria-current={active ? 'page' : undefined} className={tabClass(active)}>
                {inner}
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}

/** The frame around every page: pill top bar, page content, bottom tab bar. */
export function AppShell() {
  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-ink px-4 py-2 text-sm font-bold text-ink-contrast focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <TopBar />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-[960px] px-4 pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))] outline-none sm:px-6 sm:pt-8"
      >
        <Outlet />
      </main>
      <TabBar />
      <ScrollRestoration />
    </div>
  );
}
