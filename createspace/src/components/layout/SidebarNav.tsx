import { Link, useLocation } from 'react-router';
import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { APP_VERSION } from '@/data/updates';
import { cn } from '@/lib/cn';
import { useFavorites } from '@/state/FavoritesProvider';
import { TOOLS } from '@/tools/registry';
import { CATEGORY_NAV, PRIMARY_NAV, SECONDARY_NAV, type NavItem } from './navigation';

function NavLinkItem({ item, path }: { item: NavItem; path: string }) {
  const { ids } = useFavorites();
  const active = item.match(path);
  const count = item.count === 'tools' ? TOOLS.length : item.count === 'favorites' ? ids.length : item.count;
  const Icon = item.icon;

  return (
    <li>
      <Link
        to={item.to}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors duration-150',
          active ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface-2/70 hover:text-fg',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-2 bottom-2 -left-3 w-[3px] rounded-r-full bg-brand transition-transform duration-200',
            active ? 'scale-y-100' : 'scale-y-0',
          )}
        />
        <Icon aria-hidden="true" className={cn('size-[18px] shrink-0', active ? 'text-fg' : 'text-muted group-hover:text-fg')} />
        <span className="truncate">{item.label}</span>
        {count !== undefined && (
          <span className="ml-auto text-xs text-muted tabular-nums" aria-label={`${count} ${item.count === 'favorites' ? 'saved' : 'tools'}`}>
            {count}
          </span>
        )}
      </Link>
    </li>
  );
}

function NavGroup({ label, items, path }: { label?: string; items: NavItem[]; path: string }) {
  return (
    <div>
      {label && <div className="mb-1 px-2.5 text-[0.6875rem] font-semibold tracking-wider text-muted/80 uppercase">{label}</div>}
      <ul className="space-y-0.5">
        {items.map((item) => (
          <NavLinkItem key={item.to} item={item} path={path} />
        ))}
      </ul>
    </div>
  );
}

/** Sidebar contents, shared by the desktop sidebar and the mobile drawer. */
export function SidebarNav({ showLogo = true }: { showLogo?: boolean }) {
  const { pathname } = useLocation();
  return (
    <div className="flex h-full flex-col">
      {showLogo && (
        <div className="px-5 pt-5 pb-4">
          <Link to="/" aria-label="CreateSpace home" className="inline-flex rounded-md">
            <Logo showTagline />
          </Link>
        </div>
      )}
      <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        <NavGroup items={PRIMARY_NAV} path={pathname} />
        <NavGroup label="Categories" items={CATEGORY_NAV} path={pathname} />
        <NavGroup items={SECONDARY_NAV} path={pathname} />
      </nav>
      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-3">
        <ThemeToggle withLabel className="flex-1" />
        <span className="pr-2 text-xs text-muted tabular-nums">v{APP_VERSION}</span>
      </div>
    </div>
  );
}
