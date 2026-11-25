import { ChevronRight } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { categoryRoute, getCategory } from '@/tools/categories';
import type { ToolDefinition } from '@/tools/types';
import { BookmarkButton } from './BookmarkButton';
import { ToolIcon } from './ToolIcon';

interface Props {
  tool: ToolDefinition;
  /** Extra buttons for the header (e.g. Export) that a tool can supply. */
  actions?: ReactNode;
  /** The tool's own interface. */
  children: ReactNode;
  /** Optional content below the workspace. */
  footer?: ReactNode;
}

/**
 * The shared frame every tool page uses: breadcrumb, title, description, status,
 * bookmark control, and a dedicated workspace area for the tool itself.
 */
export function ToolPageLayout({ tool, actions, children, footer }: Props) {
  useDocumentTitle(tool.name);
  const category = getCategory(tool.category);

  return (
    <div style={{ '--accent': tool.accent } as CSSProperties} className="animate-fade-up">
      <nav aria-label="Breadcrumb" className="mb-4 px-1">
        <ol className="flex flex-wrap items-center gap-1 text-sm font-bold text-muted">
          <li>
            <Link to="/tools" className="rounded hover:text-fg">
              All Tools
            </Link>
          </li>
          <ChevronRight aria-hidden="true" className="size-3.5 opacity-60" />
          <li>
            <Link to={categoryRoute(category.id)} className="rounded hover:text-fg">
              {category.navLabel}
            </Link>
          </li>
          <ChevronRight aria-hidden="true" className="size-3.5 opacity-60" />
          <li aria-current="page" className="text-fg">
            {tool.name}
          </li>
        </ol>
      </nav>

      <header className="panel flex flex-col gap-5 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-center gap-4 sm:gap-5">
          <ToolIcon tool={tool} size="lg" />
          <div className="min-w-0">
            <h1 className="font-display text-[1.625rem] leading-tight sm:text-[2rem]">{tool.name}</h1>
            <p className="mt-1.5 max-w-xl text-[0.9375rem] leading-relaxed text-muted">{tool.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={tool.status} />
              {tool.tentative && <Badge>Tentative</Badge>}
              <Badge>{category.name}</Badge>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {actions}
          <BookmarkButton tool={tool} variant="labeled" />
        </div>
      </header>

      <section aria-label={`${tool.name} workspace`} className="mt-5 sm:mt-6">
        {children}
      </section>

      {footer && <div className="mt-5 sm:mt-6">{footer}</div>}
    </div>
  );
}
