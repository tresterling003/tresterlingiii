import { Bookmark, House, LayoutGrid, Settings, Shapes, Sparkles, type LucideIcon } from 'lucide-react';
import { CATEGORIES, categoryRoute } from '@/tools/categories';
import { getTool, toolsInCategory } from '@/tools/registry';
import type { CategoryDefinition, CategoryId } from '@/tools/types';

export interface TabItem {
  label: string;
  icon: LucideIcon;
  /** A page link, or the "categories" sheet. */
  to: string | 'categories';
  /** Highlight this tab for the current path? */
  match: (path: string) => boolean;
}

/** Category of the tool page currently open, so its category can be highlighted. */
export const toolCategory = (path: string): CategoryId | undefined =>
  path.startsWith('/tools/') ? getTool(path.split('/')[2])?.category : undefined;

const isCategoryPath = (p: string) => p.startsWith('/category/') || toolCategory(p) !== undefined;

/** Bottom tab bar. Categories opens a sheet listing every category page. */
export const TABS: TabItem[] = [
  { to: '/', label: 'Home', icon: House, match: (p) => p === '/' },
  { to: '/tools', label: 'All Tools', icon: LayoutGrid, match: (p) => p === '/tools' },
  { to: '/favorites', label: 'Favorites', icon: Bookmark, match: (p) => p === '/favorites' },
  { to: 'categories', label: 'Categories', icon: Shapes, match: isCategoryPath },
  { to: '/whats-new', label: 'What’s New', icon: Sparkles, match: (p) => p === '/whats-new' },
  { to: '/settings', label: 'Settings', icon: Settings, match: (p) => p === '/settings' },
];

// Built from the category list, so a new category appears automatically.
export const CATEGORY_LINKS: Array<CategoryDefinition & { to: string; count: number; match: (p: string) => boolean }> =
  CATEGORIES.map((c) => ({
    ...c,
    to: categoryRoute(c.id),
    count: toolsInCategory(c.id).length,
    match: (p) => p === categoryRoute(c.id) || toolCategory(p) === c.id,
  }));
