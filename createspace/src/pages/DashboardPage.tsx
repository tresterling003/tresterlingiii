import { ArrowRight, Bookmark } from 'lucide-react';
import { Link } from 'react-router';
import { CategoryFilter } from '@/components/tools/CategoryFilter';
import { NoResults } from '@/components/tools/NoResults';
import { ToolGrid } from '@/components/tools/ToolCard';
import { Panel } from '@/components/ui/Panel';
import { SectionHeader } from '@/components/ui/PageHeader';
import { SearchInput } from '@/components/ui/SearchInput';
import { UPDATES, formatDate } from '@/data/updates';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useToolFilters } from '@/hooks/useToolFilters';
import { useFavorites } from '@/state/FavoritesProvider';
import { TOOLS } from '@/tools/registry';

function greeting(date = new Date()) {
  const h = date.getHours();
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function DashboardPage() {
  useDocumentTitle();
  const { query, setQuery, category, setCategory, results } = useToolFilters();
  const favorites = useFavorites();
  const searching = query.trim() !== '';
  const latest = UPDATES[0];

  return (
    <div className="space-y-5 sm:space-y-6">
      <header className="animate-fade-up px-1">
        <p className="text-sm font-bold text-muted">{greeting()}</p>
        <h1 className="font-display text-[1.75rem] leading-tight sm:text-[2rem]">What are you making today?</h1>
      </header>

      {!searching &&
        (favorites.tools.length > 0 ? (
          <Panel label="Favorites" className="animate-fade-up">
            <SectionHeader
              id="favorites-heading"
              title="Favorites"
              count={favorites.tools.length}
              actions={
                <Link to="/favorites" className="inline-flex items-center gap-1 rounded-full text-sm font-bold text-muted hover:text-fg">
                  View all <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              }
            />
            <ToolGrid tools={favorites.tools} label="Favorite tools" />
          </Panel>
        ) : (
          <p className="flex animate-fade-up items-center gap-2.5 rounded-full bg-surface/70 px-4 py-2.5 text-sm font-semibold text-muted shadow-card">
            <Bookmark className="size-4 shrink-0" aria-hidden="true" />
            Bookmark the tools you use most and they’ll appear here.
          </p>
        ))}

      <Panel label="Tools" className="animate-fade-up">
        <SearchInput
          value={query}
          onChange={setQuery}
          shortcut
          placeholder={`Search ${TOOLS.length} tools`}
        />
        <CategoryFilter value={category} onChange={setCategory} className="mt-3" />
        <div className="mt-5">
          <SectionHeader id="all-tools-heading" title={searching ? 'Search results' : 'All tools'} count={results.length} />
          <div aria-live="polite" className="sr-only">
            {results.length} {results.length === 1 ? 'tool' : 'tools'} found
          </div>
          {results.length > 0 ? (
            <ToolGrid
              tools={results}
              label={searching ? 'Search results' : 'All tools'}
              withRequest={!searching && !category}
            />
          ) : (
            <NoResults query={query} category={category} onClearQuery={() => setQuery('')} onClearCategory={() => setCategory(null)} />
          )}
        </div>
      </Panel>

      <Link
        to="/whats-new"
        aria-label={`What’s New: version ${latest.version}, ${latest.title}`}
        className="group flex animate-fade-up items-center gap-3 rounded-[22px] bg-surface px-4 py-3.5 shadow-card transition-transform active:scale-[0.99]"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand/12 text-sm font-extrabold text-brand">
          {latest.version.split('.').slice(0, 2).join('.')}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-extrabold">What’s New · {latest.title}</span>
          <span className="block truncate text-sm text-muted">
            {formatDate(latest.date)} · {latest.highlights.slice(0, 2).join(' · ')}
          </span>
        </span>
        <ArrowRight className="ml-auto size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
