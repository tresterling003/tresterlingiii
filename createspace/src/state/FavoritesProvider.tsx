import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { FAVORITES_KEY, isIdList, sanitizeIds, toggleId } from '@/lib/favorites';
import { onExternalChange, readJSON, writeJSON } from '@/lib/storage';
import { TOOLS } from '@/tools/registry';
import type { ToolDefinition } from '@/tools/types';

interface FavoritesContextValue {
  /** Saved tool ids, most recently saved first. */
  ids: string[];
  /** Saved tools, resolved from the registry. */
  tools: ToolDefinition[];
  isFavorite: (id: string) => boolean;
  toggle: (id: string) => void;
  clear: () => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

const known = new Set(TOOLS.map((t) => t.id));
const readIds = () => sanitizeIds(readJSON<string[]>(FAVORITES_KEY, [], isIdList), known);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>(readIds);

  // Keep several open tabs in sync.
  useEffect(() => onExternalChange(FAVORITES_KEY, () => setIds(readIds())), []);

  const save = useCallback((update: (prev: string[]) => string[]) => {
    setIds((prev) => {
      const next = update(prev);
      writeJSON(FAVORITES_KEY, next);
      return next;
    });
  }, []);

  const toggle = useCallback((id: string) => save((prev) => toggleId(prev, id)), [save]);
  const clear = useCallback(() => save(() => []), [save]);

  const value = useMemo<FavoritesContextValue>(() => {
    const set = new Set(ids);
    return {
      ids,
      tools: ids.map((id) => TOOLS.find((t) => t.id === id)!).filter(Boolean),
      isFavorite: (id) => set.has(id),
      toggle,
      clear,
    };
  }, [ids, toggle, clear]);

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used inside <FavoritesProvider>');
  return ctx;
}
