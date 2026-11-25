import { CategoryFilter } from '@/components/tools/CategoryFilter';
import { NoResults } from '@/components/tools/NoResults';
import { ToolGrid } from '@/components/tools/ToolCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { SearchInput } from '@/components/ui/SearchInput';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useToolFilters } from '@/hooks/useToolFilters';
import { TOOLS } from '@/tools/registry';

export function AllToolsPage() {
  useDocumentTitle('All Tools');
  const { query, setQuery, category, setCategory, results } = useToolFilters();

  return (
    <div className="animate-fade-up space-y-5 sm:space-y-6">
      <PageHeader title="All Tools" description={`${TOOLS.length} tools are planned for version 1. None are ready to use yet.`} />
      <Panel label="Tools">
        <SearchInput value={query} onChange={setQuery} shortcut />
        <CategoryFilter value={category} onChange={setCategory} className="mt-3" />
        <p aria-live="polite" className="mt-5 mb-3 px-1 text-sm font-bold text-muted">
          Showing {results.length} of {TOOLS.length} tools
        </p>
        {results.length > 0 ? (
          <ToolGrid tools={results} label="Tools" />
        ) : (
          <NoResults query={query} category={category} onClearQuery={() => setQuery('')} onClearCategory={() => setCategory(null)} />
        )}
      </Panel>
    </div>
  );
}
