import { Check, Folder } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { useCloud } from '@/cloud/CloudProvider';
import { kindOf } from '@/cloud/files';
import { addFile, createProject } from '@/cloud/projectModel';
import { describeError } from '@/cloud/runtime';
import { TEMPLATES } from '@/cloud/templates';
import { uploadBlob } from '@/cloud/transfer';
import { saveNewProject } from '@/cloud/useCloudData';
import { CloudGate } from '@/components/cloud/CloudGate';
import { Button, ButtonLink } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Dialog';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/lib/cn';

export function NewProjectPage() {
  useDocumentTitle('New Project');
  return (
    <div className="animate-fade-up space-y-5 sm:space-y-6">
      <PageHeader title="New Project" description="Pick a template to get ready-made folders, or start blank." />
      <CloudGate feature="My Projects">
        <NewProjectForm />
      </CloudGate>
    </div>
  );
}

function NewProjectForm() {
  const { db, userId, assets } = useCloud();
  const navigate = useNavigate();
  const [templateId, setTemplateId] = useState('animation');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const template = TEMPLATES.find((t) => t.id === templateId)!;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !userId) return;
    setBusy(true);
    setError('');
    try {
      const now = new Date().toISOString();
      const built = createProject(template, name, now);
      let project = built.project;
      // Starter files (e.g. a brief to fill in) need upload permission; skip quietly without it.
      if (assets) {
        for (const s of template.starterFiles ?? []) {
          const kind = kindOf(s.name);
          if (!kind) continue;
          try {
            const up = await uploadBlob(assets, new Blob([s.content], { type: kind.type }), kind);
            project = addFile(project, { name: s.name, ...up }, built.folderByPath.get(s.folder) ?? null, now);
          } catch {
            /* the project is still useful without its starter file */
          }
        }
      }
      await saveNewProject(db, userId, project);
      navigate(`/projects/${project.id}`);
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={create} className="space-y-5 sm:space-y-6">
      <Panel label="Template">
        <h2 className="mb-3 px-1 font-display text-lg">Template</h2>
        <div role="radiogroup" aria-label="Template" className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {TEMPLATES.map((t) => {
            const Icon = t.icon;
            const on = t.id === templateId;
            return (
              <label
                key={t.id}
                style={{ '--accent': t.accent } as CSSProperties}
                className={cn(
                  'tile relative flex aspect-[4/3] cursor-pointer flex-col justify-between rounded-[22px] p-3.5 transition-transform duration-200 hover:-translate-y-0.5 sm:p-4',
                  'has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand',
                  on && 'ring-[3px] ring-ink ring-offset-2 ring-offset-panel',
                )}
              >
                <input type="radio" name="template" value={t.id} checked={on} onChange={() => setTemplateId(t.id)} className="sr-only" />
                <Icon aria-hidden="true" strokeWidth={2.3} fill="currentColor" fillOpacity={0.2} className="size-7 tile-ink" />
                {on && (
                  <span className="absolute top-3 right-3 grid size-6 place-items-center rounded-full bg-ink text-ink-contrast" aria-hidden="true">
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                )}
                <span>
                  <span className="block font-extrabold tile-ink">{t.name}</span>
                  <span className="block text-xs leading-snug font-bold tile-ink opacity-75">{t.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </Panel>

      <Panel label="Details">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <TextField label="Project name" value={name} onChange={setName} maxLength={120} placeholder={template.name} />
            <div className="mt-5 flex flex-wrap gap-2">
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? 'Creating…' : 'Create project'}
              </Button>
              <ButtonLink to="/projects">Cancel</ButtonLink>
            </div>
            {error && (
              <p role="alert" className="mt-3 text-sm font-bold text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
          </div>
          <div className="rounded-2xl bg-surface p-4 shadow-card">
            <h3 className="text-sm font-extrabold text-muted">Folders you’ll get</h3>
            {template.folders.length === 0 ? (
              <p className="mt-2 text-sm font-semibold">None. Add your own after creating it.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm font-semibold">
                {template.folders.map((f) => (
                  <li key={f.name} className="flex items-start gap-2">
                    <Folder className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
                    <span>
                      {f.name}
                      {f.children && <span className="text-muted"> ({f.children.map((c) => c.name).join(', ')})</span>}
                    </span>
                  </li>
                ))}
                {template.starterFiles?.map((s) => (
                  <li key={s.name} className="text-muted">
                    + {s.name} in {s.folder}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Panel>
    </form>
  );
}
