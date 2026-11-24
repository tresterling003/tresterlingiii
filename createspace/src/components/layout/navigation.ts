import { Bookmark, House, LayoutGrid, Settings, Sparkles, type LucideIcon } from 'lucide-react';
import { CATEGORIES, categoryRoute } from '@/tools/categories';
import { getTool, toolsInCategory } from '@/tools/registry';
import type { CategoryId } from '@/tools/types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Highlight this item for the current path? */
  match: (path: string) => boolean;
  count?: 'tools' | 'favorites' | number;
}

/** Category of the tool page currently open, so the sidebar can highlight it. */
const toolCategory = (path: string): CategoryId | undefined =>
  path.startsWith('/tools/') ? getTool(path.split('/')[2])?.category : undefined;

export const PRIMARY_NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: House, match: (p) => p === '/' },
  { to: '/tools', label: 'All Tools', icon: LayoutGrid, match: (p) => p === '/tools', count: 'tools' },
  { to: '/favorites', label: 'Favorites', icon: Bookmark, match: (p) => p === '/favorites', count: 'favorites' },
];

// Built from the category list, so a new category appears in the nav automatically.
export const CATEGORY_NAV: NavItem[] = CATEGORIES.map((c) => ({
  to: categoryRoute(c.id),
  label: c.navLabel,
  icon: c.icon,
  match: (p) => p === categoryRoute(c.id) || toolCategory(p) === c.id,
  count: toolsInCategory(c.id).length,
}));

export const SECONDARY_NAV: NavItem[] = [
  { to: '/whats-new', label: 'What’s New', icon: Sparkles, match: (p) => p === '/whats-new' },
  { to: '/settings', label: 'Settings', icon: Settings, match: (p) => p === '/settings' },
];
