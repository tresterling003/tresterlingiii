import { Bookmark } from 'lucide-react';
import { ToolGrid } from '@/components/tools/ToolCard';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useFavorites } from '@/state/FavoritesProvider';

export function FavoritesPage() {
  useDocumentTitle('Favorites');
  const { tools } = useFavorites();

  return (
    <div className="animate-fade-up space-y-5 sm:space-y-6">
      <PageHeader
        title="Favorites"
        description="Tools you’ve bookmarked, most recent first. Saved in this browser."
      />
      <Panel label="Saved tools">
        {tools.length > 0 ? (
          <>
            <p className="mb-3 px-1 text-sm font-bold text-muted">
              {tools.length} saved {tools.length === 1 ? 'tool' : 'tools'}
            </p>
            <ToolGrid tools={tools} label="Favorite tools" />
          </>
        ) : (
          <EmptyState
            icon={Bookmark}
            title="No favorites yet"
            actions={
              <ButtonLink to="/tools" variant="primary" size="sm">
                Browse all tools
              </ButtonLink>
            }
          >
            Tap the bookmark on any tool to save it here for quick access.
          </EmptyState>
        )}
      </Panel>
    </div>
  );
}
