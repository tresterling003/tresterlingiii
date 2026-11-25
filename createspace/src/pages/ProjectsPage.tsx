import { Cloud, FolderPlus, Plus } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { useCloud } from '@/cloud/CloudProvider';
import { formatBytes, formatWhen } from '@/cloud/files';
import { projectSize, type Project } from '@/cloud/projectModel';
import { getTemplate, TEMPLATES } from '@/cloud/templates';
import { useProjects } from '@/cloud/useCloudData';
import { CloudGate, LoadNotice } from '@/components/cloud/CloudGate';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export function ProjectTile({ project }: { project: Project }) {
  const t = getTemplate(project.templateId) ?? TEMPLATES[0];
  const Icon = t.icon;
  return (
    <Link
      to={`/projects/${project.id}`}
      style={{ '--accent': t.accent } as CSSProperties}
      className="tile group flex aspect-[4/3] flex-col justify-between rounded-[22px] p-3.5 transition-transform duration-200 hover:-translate-y-1 active:scale-[0.98] sm:p-4"
    >
      <Icon aria-hidden="true" strokeWidth={2.3} fill="currentColor" fillOpacity={0.2} className="size-7 tile-ink sm:size-8" />
      <span className="min-w-0">
        <span className="block truncate font-extrabold tile-ink">{project.name}</span>
        <span className="block truncate text-xs font-bold tile-ink opacity-75">
          {project.files.length} {project.files.length === 1 ? 'file' : 'files'} · {formatBytes(projectSize(project))} · {formatWhen(project.updatedAt)}
        </span>
      </span>
    </Link>
  );
}

export function ProjectsPage() {
  useDocumentTitle('My Projects');
  const { status } = useCloud();
  return (
    <div className="animate-fade-up space-y-5 sm:space-y-6">
      <PageHeader
        title="My Projects"
        description="Project folders saved to your account. Upload here, then open CreateSpace on any computer to download and keep working."
        actions={
          status === 'ready' && (
            <ButtonLink to="/projects/new" variant="primary">
              <Plus aria-hidden="true" /> New project
            </ButtonLink>
          )
        }
      />
      <CloudGate feature="My Projects">
        <ProjectList />
      </CloudGate>
    </div>
  );
}

function ProjectList() {
  const { projects, state } = useProjects();
  return (
    <Panel label="Projects">
      <LoadNotice state={state} />
      {state === 'loading' && projects.length === 0 ? (
        <p role="status" className="py-10 text-center text-sm font-bold text-muted">
          Loading your projects…
        </p>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderPlus}
          title="No projects yet"
          actions={
            <ButtonLink to="/projects/new" variant="primary" size="sm">
              <Plus aria-hidden="true" /> New project
            </ButtonLink>
          }
        >
          Start from a template like Animation or Brand Identity and the folders are made for you.
        </EmptyState>
      ) : (
        <>
          <p className="mb-3 flex items-center gap-1.5 px-1 text-sm font-bold text-muted">
            <Cloud className="size-4" aria-hidden="true" /> Saved to your account
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4" aria-label="Your projects">
            {projects.map((p) => (
              <li key={p.id}>
                <ProjectTile project={p} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
