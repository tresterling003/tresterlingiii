import { SearchX } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { getCategory } from '@/tools/categories';
import type { CategoryId } from '@/tools/types';

interface Props {
  query: string;
  category: CategoryId | null;
  onClearQuery: () => void;
  onClearCategory?: () => void;
}

/** Shown when search and/or category filters match nothing, with ways out. */
export function NoResults({ query, category, onClearQuery, onClearCategory }: Props) {
  const where = category ? ` in ${getCategory(category).name}` : '';
  return (
    <EmptyState
      icon={SearchX}
      title={query.trim() ? `No tools match “${query.trim()}”${where}` : `No tools${where}`}
      actions={
        <>
          {query.trim() && (
            <Button size="sm" onClick={onClearQuery}>
              Clear search
            </Button>
          )}
          {category && onClearCategory && (
            <Button size="sm" onClick={onClearCategory}>
              Search all categories
            </Button>
          )}
        </>
      }
    >
      Try a different word, such as “color”, “video” or “invoice”. Missing something?{' '}
      <Link to="/suggest" className="font-bold text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg">
        Suggest a tool
      </Link>
      .
    </EmptyState>
  );
}
