import { CategoryFilter } from '@/components/tools/CategoryFilter';
import { NoResults } from '@/components/tools/NoResults';
import { ToolGrid } from '@/components/tools/ToolCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchInput } from '@/components/ui/SearchInput';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useToolFilters } from '@/hooks/useToolFilters';
import { TOOLS } from '@/tools/registry';

export function AllToolsPage() {
  useDocumentTitle('All Tools');
  const { query, setQuery, category, setCategory, results } = useToolFilters();

  return (
    <div className="animate-fade-up">
      <PageHeader title="All Tools" description={`Every tool in CreateSpace. ${TOOLS.length} are planned for version 1, and none are ready to use yet.`} />
      <div className="mt-6 flex flex-col gap-3">
        <SearchInput value={query} onChange={setQuery} shortcut className="max-w-xl" />
        <CategoryFilter value={category} onChange={setCategory} />
      </div>
      <p aria-live="polite" className="mt-5 mb-3 text-sm text-muted">
        Showing {results.length} of {TOOLS.length} tools
      </p>
      {results.length > 0 ? (
        <ToolGrid tools={results} label="Tools" />
      ) : (
        <NoResults query={query} category={category} onClearQuery={() => setQuery('')} onClearCategory={() => setCategory(null)} />
      )}
    </div>
  );
}
