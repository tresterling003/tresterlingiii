import { useParams } from 'react-router';
import { NoResults } from '@/components/tools/NoResults';
import { ToolGrid } from '@/components/tools/ToolCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchInput } from '@/components/ui/SearchInput';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useToolFilters } from '@/hooks/useToolFilters';
import { getCategory, isCategoryId } from '@/tools/categories';
import { toolsInCategory } from '@/tools/registry';
import type { CategoryId } from '@/tools/types';
import { NotFoundPage } from './NotFoundPage';

export function CategoryPage() {
  const { categoryId } = useParams();
  if (!isCategoryId(categoryId)) return <NotFoundPage />;
  // key resets the search box when switching between categories
  return <CategoryView key={categoryId} categoryId={categoryId} />;
}

function CategoryView({ categoryId }: { categoryId: CategoryId }) {
  const category = getCategory(categoryId);
  useDocumentTitle(category.navLabel);
  const tools = toolsInCategory(categoryId);
  const { query, setQuery, results } = useToolFilters(tools, { useCategory: false });
  const Icon = category.icon;

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Icon className="size-4" aria-hidden="true" /> Category
          </span>
        }
        title={category.navLabel}
        description={category.description}
      />
      <SearchInput
        value={query}
        onChange={setQuery}
        shortcut
        label={`Search ${category.navLabel}`}
        placeholder={`Search ${category.name.toLowerCase()} tools`}
        className="mt-6 max-w-xl"
      />
      <p aria-live="polite" className="mt-5 mb-3 text-sm text-muted">
        {results.length} of {tools.length} tools
      </p>
      {results.length > 0 ? (
        <ToolGrid tools={results} label={category.navLabel} />
      ) : (
        <NoResults query={query} category={categoryId} onClearQuery={() => setQuery('')} />
      )}
    </div>
  );
}
