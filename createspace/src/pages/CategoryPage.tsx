import { useParams } from 'react-router';
import { NoResults } from '@/components/tools/NoResults';
import { ToolGrid } from '@/components/tools/ToolCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
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
    <div className="animate-fade-up space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Icon className="size-4" aria-hidden="true" /> Category
          </span>
        }
        title={category.navLabel}
        description={category.description}
      />
      <Panel label={category.navLabel}>
        <SearchInput
          value={query}
          onChange={setQuery}
          shortcut
          label={`Search ${category.navLabel}`}
          placeholder={`Search ${category.name.toLowerCase()} tools`}
        />
        <p aria-live="polite" className="mt-5 mb-3 px-1 text-sm font-bold text-muted">
          {results.length} of {tools.length} tools
        </p>
        {results.length > 0 ? (
          <ToolGrid tools={results} label={category.navLabel} />
        ) : (
          <NoResults query={query} category={categoryId} onClearQuery={() => setQuery('')} />
        )}
      </Panel>
    </div>
  );
}
