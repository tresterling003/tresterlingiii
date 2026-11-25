import { ArrowRight, FolderPlus } from 'lucide-react';
import { Link } from 'react-router';
import { useCloud } from '@/cloud/CloudProvider';
import { useProjects } from '@/cloud/useCloudData';
import { SectionHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { ProjectTile } from '@/pages/ProjectsPage';

/** Dashboard section: your latest cloud projects (only when cloud storage is connected). */
export function RecentProjects() {
  const { status } = useCloud();
  if (status !== 'ready') return null;
  return <Recent />;
}

function Recent() {
  const { projects, state } = useProjects();
  if (state === 'loading' && projects.length === 0) return null;
  if (projects.length === 0)
    return (
      <Link
        to="/projects/new"
        className="flex animate-fade-up items-center gap-2.5 rounded-full bg-surface/70 px-4 py-2.5 text-sm font-semibold text-muted shadow-card hover:text-fg"
      >
        <FolderPlus className="size-4 shrink-0" aria-hidden="true" />
        Start a cloud project from a template. Open it on any computer.
        <ArrowRight className="ml-auto size-4 shrink-0" aria-hidden="true" />
      </Link>
    );
  return (
    <Panel label="Recent projects" className="animate-fade-up">
      <SectionHeader
        title="Recent projects"
        count={projects.length}
        actions={
          <Link to="/projects" className="inline-flex items-center gap-1 rounded-full text-sm font-bold text-muted hover:text-fg">
            View all <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        }
      />
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="Recent projects">
        {projects.slice(0, 4).map((p) => (
          <li key={p.id}>
            <ProjectTile project={p} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
