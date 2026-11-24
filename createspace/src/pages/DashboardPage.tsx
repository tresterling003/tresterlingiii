import { ArrowRight, Bookmark, MessageSquarePlus } from 'lucide-react';
import { Link } from 'react-router';
import { CategoryFilter } from '@/components/tools/CategoryFilter';
import { NoResults } from '@/components/tools/NoResults';
import { ToolGrid } from '@/components/tools/ToolCard';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
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
    <div className="animate-fade-up">
      <header className="max-w-3xl">
        <p className="text-sm font-medium text-muted">{greeting()}</p>
        <h1 className="mt-1 font-display text-[1.875rem] leading-tight font-bold sm:text-[2.25rem]">What are you making today?</h1>
      </header>

      <SearchInput
        value={query}
        onChange={setQuery}
        shortcut
        size="lg"
        placeholder={`Search ${TOOLS.length} tools by name, task or keyword`}
        className="mt-5 max-w-3xl"
      />

      <div className="mt-10 grid gap-10 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-10">
          {!searching && (
            <section aria-labelledby="favorites-heading">
              <SectionHeader
                id="favorites-heading"
                title="Favorites"
                count={favorites.tools.length || undefined}
                actions={
                  favorites.tools.length > 0 && (
                    <Link to="/favorites" className="inline-flex items-center gap-1 rounded text-sm font-medium text-muted hover:text-fg">
                      View all <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  )
                }
              />
              {favorites.tools.length > 0 ? (
                <ToolGrid tools={favorites.tools.slice(0, 6)} label="Favorite tools" width="narrow" />
              ) : (
                <div className="flex items-center gap-3 rounded-lg border border-dashed border-line-strong px-4 py-4 text-sm text-muted">
                  <Bookmark className="size-4 shrink-0" aria-hidden="true" />
                  <span>Bookmark the tools you use most and they’ll appear here.</span>
                </div>
              )}
            </section>
          )}

          <section aria-labelledby="all-tools-heading">
            <SectionHeader
              id="all-tools-heading"
              title={searching ? 'Search results' : 'All tools'}
              count={results.length}
            />
            <CategoryFilter value={category} onChange={setCategory} className="mb-4" />
            <div aria-live="polite" className="sr-only">
              {results.length} {results.length === 1 ? 'tool' : 'tools'} found
            </div>
            {results.length > 0 ? (
              <ToolGrid tools={results} label={searching ? 'Search results' : 'All tools'} width="narrow" />
            ) : (
              <NoResults
                query={query}
                category={category}
                onClearQuery={() => setQuery('')}
                onClearCategory={() => setCategory(null)}
              />
            )}
          </section>
        </div>

        <aside className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-1" aria-label="Updates and requests">
          <section aria-labelledby="whats-new-heading" className="rounded-lg border border-line bg-surface p-4 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <h2 id="whats-new-heading" className="font-display text-base font-semibold">What’s New</h2>
              <Badge>v{latest.version}</Badge>
            </div>
            <p className="mt-2 text-sm font-medium">{latest.title}</p>
            <p className="text-xs text-muted">{formatDate(latest.date)}</p>
            <ul className="mt-3 space-y-1.5">
              {latest.highlights.slice(0, 3).map((h) => (
                <li key={h} className="flex gap-2 text-sm leading-snug text-muted">
                  <span aria-hidden="true" className="mt-[7px] size-1 shrink-0 rounded-full bg-brand" />
                  {h}
                </li>
              ))}
            </ul>
            <Link to="/whats-new" className="mt-3 inline-flex items-center gap-1 rounded text-sm font-medium hover:underline">
              All updates <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </section>

          <section aria-labelledby="request-heading" className="rounded-lg border border-line bg-surface p-4 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <h2 id="request-heading" className="flex items-center gap-2 font-display text-base font-semibold">
                <MessageSquarePlus className="size-4 text-muted" aria-hidden="true" />
                Request a tool
              </h2>
              <Badge tone="outline">Planned</Badge>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Suggesting tools isn’t open yet. It’s on the roadmap.
            </p>
            <ButtonLink to="/request-tool" size="sm" className="mt-3">
              Learn more
            </ButtonLink>
          </section>
        </aside>
      </div>
    </div>
  );
}
