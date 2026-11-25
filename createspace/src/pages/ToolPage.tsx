import { Suspense } from 'react';
import { useParams } from 'react-router';
import { ToolGrid } from '@/components/tools/ToolCard';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { ToolUnavailable } from '@/components/tools/ToolUnavailable';
import { SectionHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { getCategory } from '@/tools/categories';
import { getTool, toolsInCategory } from '@/tools/registry';
import { STATUS } from '@/tools/status';
import { NotFoundPage } from './NotFoundPage';

/** Every /tools/:toolId address renders here, using the shared tool layout. */
export function ToolPage() {
  const tool = getTool(useParams().toolId);
  if (!tool) return <NotFoundPage />;

  const Workspace = STATUS[tool.status].usable ? tool.workspace : undefined;
  const related = toolsInCategory(tool.category).filter((t) => t.id !== tool.id).slice(0, 3);

  return (
    <ToolPageLayout
      key={tool.id}
      tool={tool}
      footer={
        !Workspace &&
        related.length > 0 && (
          <Panel label="Related tools">
            <SectionHeader id="related-heading" title={`More ${getCategory(tool.category).name.toLowerCase()} tools`} />
            <ToolGrid tools={related} label="Related tools" />
          </Panel>
        )
      }
    >
      {Workspace ? (
        <Suspense fallback={<div className="panel min-h-[340px] animate-pulse" aria-label="Loading tool" />}>
          <Workspace />
        </Suspense>
      ) : (
        <ToolUnavailable tool={tool} />
      )}
    </ToolPageLayout>
  );
}
