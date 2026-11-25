import { Folder, FolderPlus } from 'lucide-react';
import { useState } from 'react';
import { useCloud } from '@/cloud/CloudProvider';
import { kindOf } from '@/cloud/files';
import { childFolders, createProject, type Project } from '@/cloud/projectModel';
import { describeError } from '@/cloud/runtime';
import { getTemplate } from '@/cloud/templates';
import { uploadBlob } from '@/cloud/transfer';
import { addFileToProject, saveNewProject, useProjects } from '@/cloud/useCloudData';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { cn } from '@/lib/cn';

/** Lets any tool save its result into one of the person's cloud projects. */
export function SaveToProjectDialog({
  blob,
  filename,
  onClose,
  onSaved,
}: {
  blob: Blob;
  filename: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { db, userId, assets } = useCloud();
  const { projects, state } = useProjects();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const chosen: Project | undefined = projects.find((p) => p.id === (projectId ?? projects[0]?.id));

  const folders: { id: string | null; label: string; depth: number }[] = [{ id: null, label: 'Top level', depth: 0 }];
  const walk = (p: Project, parent: string | null, depth: number) => {
    for (const f of childFolders(p, parent)) {
      folders.push({ id: f.id, label: f.name, depth });
      walk(p, f.id, depth + 1);
    }
  };
  if (chosen) walk(chosen, null, 1);

  const save = async () => {
    if (!db || !userId || !assets) return;
    const kind = kindOf(filename);
    if (!kind) return setError('This file type can’t be saved to projects.');
    setBusy(true);
    setError('');
    try {
      let target = chosen;
      if (!target) {
        target = createProject(getTemplate('blank')!, 'My Exports', new Date().toISOString()).project;
        await saveNewProject(db, userId, target);
      }
      const up = await uploadBlob(assets, blob, kind);
      const savedName = await addFileToProject(db, userId, target.id, { name: filename, ...up }, chosen ? folderId : null);
      onSaved(`Saved ${savedName} to ${target.name}.`);
      onClose();
    } catch (e) {
      setError((e as { message?: string })?.message && (e as { code?: string }).code === 'missing' ? (e as Error).message : describeError(e));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Save to My Projects"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={busy || !assets || state === 'loading'}>
            {busy ? 'Saving…' : chosen ? 'Save here' : 'Create “My Exports” and save'}
          </Button>
        </>
      }
    >
      {!assets ? (
        <p className="text-sm text-muted">Your access level can’t upload files, so this can’t be saved to a project. Download it instead.</p>
      ) : state === 'loading' && projects.length === 0 ? (
        <p className="text-sm font-bold text-muted">Loading your projects…</p>
      ) : projects.length === 0 ? (
        <p className="flex items-start gap-2 text-sm text-muted">
          <FolderPlus className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          You don’t have any projects yet. A project called “My Exports” will be created for this file.
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="save-project" className="mb-1.5 block px-1 text-sm font-extrabold">
              Project
            </label>
            <select
              id="save-project"
              value={chosen?.id}
              onChange={(e) => {
                setProjectId(e.target.value);
                setFolderId(null);
              }}
              className="h-12 w-full rounded-2xl border border-line bg-surface px-4 font-bold shadow-card"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div role="radiogroup" aria-label="Folder" className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {folders.map((o) => (
              <label
                key={o.id ?? 'root'}
                style={{ paddingLeft: `${0.75 + o.depth}rem` }}
                className={cn('flex h-10 cursor-pointer items-center gap-2 rounded-xl pr-3 text-sm font-bold', folderId === o.id ? 'bg-ink text-ink-contrast' : 'hover:bg-surface-2')}
              >
                <input type="radio" name="save-folder" className="sr-only" checked={folderId === o.id} onChange={() => setFolderId(o.id)} />
                <Folder className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm font-bold text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </Dialog>
  );
}
