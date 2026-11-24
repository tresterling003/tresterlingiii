import { Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { SidebarNav } from './SidebarNav';

/**
 * The frame around every page:
 * - desktop (≥1024px): fixed sidebar on the left
 * - tablet and phone: a slim top bar with a menu button that opens the same navigation as a drawer
 */
export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const menuButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);

  // Close the drawer whenever the page changes.
  useEffect(() => setMenuOpen(false), [pathname]);

  // While the drawer is open: Escape closes it, focus moves inside, and the page behind can't scroll.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    drawer.current?.querySelector<HTMLElement>('a[aria-current="page"], a')?.focus();
    const button = menuButton.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      button?.focus();
    };
  }, [menuOpen]);

  // Close the drawer if the window is widened to desktop size.
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1024px)');
    const onChange = () => m.matches && setMenuOpen(false);
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, []);

  return (
    <div className="min-h-dvh lg:pl-64">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-ink px-3 py-2 text-sm text-ink-contrast focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-surface lg:block">
        <SidebarNav />
      </aside>

      {/* Compact top bar (tablet & phone) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-line bg-canvas/90 px-2 backdrop-blur-sm sm:px-4 lg:hidden">
        <button
          ref={menuButton}
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          className="grid size-10 place-items-center rounded-md text-fg hover:bg-surface-2"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
        <Link to="/" aria-label="CreateSpace home" className="rounded-md">
          <Logo />
        </Link>
        <ThemeToggle className="size-10" />
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={() => setMenuOpen(false)} aria-hidden="true" />
          <div
            ref={drawer}
            id="mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] animate-drawer-in flex-col border-r border-line bg-surface shadow-lift"
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <Logo showTagline />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="grid size-9 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <SidebarNav showLogo={false} />
            </div>
          </div>
        </div>
      )}

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1280px] px-4 pt-6 pb-16 outline-none sm:px-6 lg:px-10 lg:pt-10">
        <Outlet />
      </main>
      <ScrollRestoration />
    </div>
  );
}
