import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { filterTools } from '@/lib/search';
import { isCategoryId } from '@/tools/categories';
import { TOOLS } from '@/tools/registry';
import type { CategoryId, ToolDefinition } from '@/tools/types';

/**
 * Search text and category filter, stored in the page address (?q=...&category=...).
 * Keeping them in the URL means Back/Forward and refresh keep your search, and results can be linked.
 */
export function useToolFilters(source: ToolDefinition[] = TOOLS, { useCategory = true } = {}) {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const rawCategory = params.get('category');
  const category: CategoryId | null = useCategory && isCategoryId(rawCategory) ? rawCategory : null;

  const update = useCallback(
    (key: 'q' | 'category', value: string | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true, preventScrollReset: true },
      ),
    [setParams],
  );

  const setQuery = useCallback((q: string) => update('q', q), [update]);
  const setCategory = useCallback((c: CategoryId | null) => update('category', c), [update]);

  const results = useMemo(() => filterTools(source, { query, category }), [source, query, category]);

  return { query, setQuery, category, setCategory, results, isFiltering: query.trim() !== '' || category !== null };
}
