import {
  ArrowUpFromLine,
  ChevronRight,
  Download,
  File as FileIcon,
  FileText,
  Film,
  Folder as FolderIcon,
  FolderPlus,
  History,
  Image as ImageIcon,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
  Type,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useCloud } from '@/cloud/CloudProvider';
import { ACCEPT_ATTR, checkFile, formatBytes, formatWhen, kindOf, SUPPORTED_LIST } from '@/cloud/files';
import {
  addFile,
  addFolder,
  addVersion,
  childFolders,
  current,
  deleteFile,
  deleteFolder,
  descendantFolderIds,
  filesIn,
  folderPath,
  moveFile,
  projectSize,
  renameFile,
  renameFolder,
  type Project,
  type ProjectFile,
} from '@/cloud/projectModel';
import { assetUrl, describeError } from '@/cloud/runtime';
import { getTemplate, TEMPLATES } from '@/cloud/templates';
import { deleteAssets, downloadAsset, uploadBlob } from '@/cloud/transfer';
import { useProject } from '@/cloud/useCloudData';
import { CloudGate, LoadNotice } from '@/components/cloud/CloudGate';
import { Button } from '@/components/ui/Button';
import { Dialog, TextField } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/lib/cn';
import { NotFoundPage } from './NotFoundPage';

type Upload = { key: string; name: string; state: 'uploading' | 'done' | 'error'; message?: string };
type DialogState =
  | { kind: 'new-folder' }
  | { kind: 'rename-project' }
  | { kind: 'rename-folder'; id: string; name: string }
  | { kind: 'rename-file'; file: ProjectFile }
  | { kind: 'move'; file: ProjectFile }
  | { kind: 'versions'; file: ProjectFile }
  | { kind: 'preview'; file: ProjectFile }
  | { kind: 'delete-file'; file: ProjectFile }
  | { kind: 'delete-folder'; id: string; name: string }
  | { kind: 'delete-project' }
  | null;

export function ProjectPage() {
  return (
    <CloudGate feature="My Projects">
      <ProjectView />
    </CloudGate>
  );
}

function ProjectView() {
  const { projectId } = useParams();
  const { project, state, missing, mutate, remove } = useProject(projectId);
  useDocumentTitle(project?.name ?? 'Project');

  if (missing) return <NotFoundPage />;
  if (!project)
    return (
      <div className="space-y-4">
        <LoadNotice state={state} />
        <p role="status" className="py-16 text-center text-sm font-bold text-muted">
          Opening project…
        </p>
      </div>
    );
  return <ProjectWorkspace project={project} mutate={mutate} remove={remove} />;
}

const now = () => new Date().toISOString();

function ProjectWorkspace({
  project,
  mutate,
  remove,
}: {
  project: Project;
  mutate: (change: (p: Project) => Project) => Promise<unknown>;
  remove: () => Promise<unknown>;
}) {
  const { assets, downloads, canUpload } = useCloud();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawFolder = params.get('folder');
  const folderId = rawFolder && project.folders.some((f) => f.id === rawFolder) ? rawFolder : null;
  const openFolder = (id: string | null) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (id) n.set('folder', id);
      else n.delete('folder');
      return n;
    });

  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [message, setMessage] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<ProjectFile | null>(null);
  const closeDialog = useCallback(() => setDialog(null), []);

  const template = getTemplate(project.templateId) ?? TEMPLATES[0];
  const TemplateIcon = template.icon;
  const crumbs = folderPath(project, folderId);
  const folders = childFolders(project, folderId);
  const files = filesIn(project, folderId);

  const fail = (e: unknown) => setMessage(describeError(e));

  /** Upload each file in turn and add it to the current folder. */
  const uploadFiles = async (list: FileList | File[]) => {
    if (!assets) return;
    const target = folderId;
    for (const file of Array.from(list)) {
      const key = `${file.name}-${Math.random()}`;
      const check = checkFile(file);
      if (!check.ok) {
        setUploads((u) => [...u, { key, name: file.name, state: 'error', message: check.reason }]);
        continue;
      }
      setUploads((u) => [...u, { key, name: file.name, state: 'uploading' }]);
      try {
        const up = await uploadBlob(assets, file, check.kind);
        await mutate((p) => addFile(p, { name: file.name, ...up }, target, now()));
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, state: 'done' } : x)));
      } catch (e) {
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, state: 'error', message: describeError(e) } : x)));
      }
    }
  };

  const replaceFile = async (target: ProjectFile, file: File) => {
    if (!assets) return;
    const check = checkFile(file);
    if (!check.ok) return setMessage(check.reason);
    setMessage(`Uploading new version of ${target.name}…`);
    try {
      const up = await uploadBlob(assets, file, check.kind);
      let dropped: string[] = [];
      await mutate((p) => {
        const r = addVersion(p, target.id, up, now());
        dropped = r.droppedAssetIds;
        return r.project;
      });
      await deleteAssets(assets, dropped);
      setMessage(`${target.name} updated to version ${target.versions.length + 1}.`);
    } catch (e) {
      fail(e);
    }
  };

  const download = async (file: ProjectFile, assetId = current(file).assetId) => {
    if (!downloads) return;
    try {
      await downloadAsset(downloads, assetId, file.name);
      setMessage(`Downloaded ${file.name}.`);
    } catch (e) {
      fail(e);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (canUpload && e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  };

  return (
    <div className="animate-fade-up space-y-5 sm:space-y-6">
      {/* Header */}
      <nav aria-label="Breadcrumb" className="px-1">
        <ol className="flex flex-wrap items-center gap-1 text-sm font-bold text-muted">
          <li>
            <Link to="/projects" className="rounded hover:text-fg">
              My Projects
            </Link>
          </li>
          <ChevronRight aria-hidden="true" className="size-3.5 opacity-60" />
          <li aria-current="page" className="text-fg">
            {project.name}
          </li>
        </ol>
      </nav>

      <header className="panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-center gap-4">
          <span
            style={{ '--accent': template.accent } as CSSProperties}
            className="tile grid size-16 shrink-0 place-items-center rounded-[20px] tile-ink sm:size-20"
            aria-hidden="true"
          >
            <TemplateIcon strokeWidth={2.3} fill="currentColor" fillOpacity={0.2} className="size-8 sm:size-9" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-[1.625rem] leading-tight break-words sm:text-[2rem]">{project.name}</h1>
            <p className="mt-1 text-sm font-bold text-muted">
              {template.name} · {project.files.length} {project.files.length === 1 ? 'file' : 'files'} · {formatBytes(projectSize(project))} ·
              updated {formatWhen(project.updatedAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setDialog({ kind: 'rename-project' })}>
            <Pencil aria-hidden="true" /> Rename
          </Button>
          <Button size="sm" onClick={() => setDialog({ kind: 'delete-project' })}>
            <Trash2 aria-hidden="true" /> Delete
          </Button>
        </div>
      </header>

      {/* Browser */}
      <section
        aria-label="Project files"
        onDragOver={(e) => {
          if (!canUpload) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
        onDrop={onDrop}
        className={cn('panel relative p-3.5 sm:p-6', dragging && 'outline-[3px] outline-offset-2 outline-brand outline-dashed')}
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-[28px] bg-panel/85 text-lg font-extrabold">
            Drop to upload to {crumbs.at(-1)?.name ?? 'this project'}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Folder path" className="min-w-0">
            <ol className="flex flex-wrap items-center gap-1 font-display text-lg">
              <li>
                <button
                  type="button"
                  onClick={() => openFolder(null)}
                  className={cn('rounded-lg px-1', crumbs.length ? 'text-muted hover:text-fg' : 'text-fg')}
                  aria-current={crumbs.length ? undefined : 'location'}
                >
                  All files
                </button>
              </li>
              {crumbs.map((f, i) => (
                <li key={f.id} className="flex items-center gap-1">
                  <ChevronRight aria-hidden="true" className="size-4 text-muted" />
                  <button
                    type="button"
                    onClick={() => openFolder(f.id)}
                    className={cn('rounded-lg px-1 break-all', i === crumbs.length - 1 ? 'text-fg' : 'text-muted hover:text-fg')}
                    aria-current={i === crumbs.length - 1 ? 'location' : undefined}
                  >
                    {f.name}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <div className="flex flex-wrap gap-2">
            {folderId && (
              <>
                <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'rename-folder', id: folderId, name: crumbs.at(-1)!.name })}>
                  <Pencil aria-hidden="true" /> Rename folder
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'delete-folder', id: folderId, name: crumbs.at(-1)!.name })}>
                  <Trash2 aria-hidden="true" /> Delete folder
                </Button>
              </>
            )}
            <Button size="sm" onClick={() => setDialog({ kind: 'new-folder' })}>
              <FolderPlus aria-hidden="true" /> New folder
            </Button>
            {canUpload && (
              <Button size="sm" variant="primary" onClick={() => fileInput.current?.click()}>
                <Upload aria-hidden="true" /> Upload files
              </Button>
            )}
          </div>
        </div>

        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="hidden"
          aria-label="Choose files to upload"
          data-testid="upload-input"
          onChange={(e) => {
            if (e.target.files?.length) uploadFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={replaceInput}
          type="file"
          accept={ACCEPT_ATTR}
          className="hidden"
          aria-label="Choose a new version"
          data-testid="replace-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f && replaceTarget.current) replaceFile(replaceTarget.current, f);
            e.target.value = '';
          }}
        />

        {!canUpload && (
          <p className="mt-3 rounded-2xl bg-surface px-4 py-2.5 text-sm font-semibold text-muted shadow-card">
            Your access level can’t upload files here. You can still organize folders and download files.
          </p>
        )}

        {message && (
          <p role="status" className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-2.5 text-sm font-bold shadow-card">
            <span>{message}</span>
            <button type="button" onClick={() => setMessage('')} className="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:text-fg" aria-label="Dismiss message">
              <X className="size-4" aria-hidden="true" />
            </button>
          </p>
        )}

        {uploads.length > 0 && (
          <div className="mt-3 rounded-2xl bg-surface p-3 shadow-card">
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-sm font-extrabold">Uploads</span>
              {uploads.every((u) => u.state !== 'uploading') && (
                <button type="button" className="text-sm font-bold text-muted hover:text-fg" onClick={() => setUploads([])}>
                  Clear
                </button>
              )}
            </div>
            <ul aria-label="Uploads" aria-live="polite" className="space-y-1">
              {uploads.map((u) => (
                <li key={u.key} className="flex flex-wrap items-baseline gap-x-2 px-1 text-sm">
                  <span className="font-bold break-all">{u.name}</span>
                  <span
                    className={cn(
                      'font-semibold',
                      u.state === 'error' ? 'text-red-600 dark:text-red-400' : u.state === 'done' ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted',
                    )}
                  >
                    {u.state === 'uploading' ? 'Uploading…' : u.state === 'done' ? 'Uploaded' : u.message}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Folders */}
        {folders.length > 0 && (
          <ul aria-label="Folders" className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {folders.map((f) => {
              const inside = descendantFolderIds(project, f.id);
              const count = project.files.filter((x) => x.folderId && inside.has(x.folderId)).length;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => openFolder(f.id)}
                    style={{ '--accent': template.accent } as CSSProperties}
                    className="tile flex w-full items-center gap-3 rounded-[18px] p-3 text-left transition-transform duration-150 hover:-translate-y-0.5 active:scale-[0.98]"
                  >
                    <FolderIcon aria-hidden="true" strokeWidth={2.3} fill="currentColor" fillOpacity={0.25} className="size-7 shrink-0 tile-ink" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-extrabold tile-ink">{f.name}</span>
                      <span className="block text-xs font-bold tile-ink opacity-70">
                        {count} {count === 1 ? 'file' : 'files'}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Files */}
        {files.length > 0 ? (
          <ul aria-label="Files" className="mt-5 space-y-2">
            {files.map((f) => (
              <FileRow
                key={f.id}
                file={f}
                canDownload={!!downloads}
                canUpload={canUpload}
                onOpen={() => setDialog({ kind: 'preview', file: f })}
                onDownload={() => download(f)}
                onReplace={() => {
                  replaceTarget.current = f;
                  replaceInput.current?.click();
                }}
                onRename={() => setDialog({ kind: 'rename-file', file: f })}
                onMove={() => setDialog({ kind: 'move', file: f })}
                onVersions={() => setDialog({ kind: 'versions', file: f })}
                onDelete={() => setDialog({ kind: 'delete-file', file: f })}
              />
            ))}
          </ul>
        ) : (
          folders.length === 0 && (
            <EmptyState
              icon={ArrowUpFromLine}
              title={crumbs.length ? 'This folder is empty' : 'No files yet'}
              className="mt-5"
              actions={
                canUpload && (
                  <Button size="sm" variant="primary" onClick={() => fileInput.current?.click()}>
                    <Upload aria-hidden="true" /> Upload files
                  </Button>
                )
              }
            >
              {canUpload ? 'Drag files here or use Upload. ' : ''}Supported: {SUPPORTED_LIST}. Up to 20 MB each.
            </EmptyState>
          )
        )}
        {(files.length > 0 || folders.length > 0) && (
          <p className="mt-4 px-1 text-xs font-semibold text-muted">
            Supported files: {SUPPORTED_LIST}, up to 20 MB each.{canUpload ? ' Drag files anywhere on this panel to upload.' : ''}
          </p>
        )}
      </section>

      {/* Dialogs */}
      {dialog?.kind === 'new-folder' && (
        <NameDialog
          title="New folder"
          label="Folder name"
          initial=""
          confirm="Create folder"
          onClose={closeDialog}
          onSave={(name) => mutate((p) => addFolder(p, name, folderId, now())).catch(fail)}
        />
      )}
      {dialog?.kind === 'rename-project' && (
        <NameDialog
          title="Rename project"
          label="Project name"
          initial={project.name}
          confirm="Save"
          onClose={closeDialog}
          onSave={(name) => mutate((p) => (name.trim() ? { ...p, name: name.trim().slice(0, 120), updatedAt: now() } : p)).catch(fail)}
        />
      )}
      {dialog?.kind === 'rename-folder' && (
        <NameDialog
          title="Rename folder"
          label="Folder name"
          initial={dialog.name}
          confirm="Save"
          onClose={closeDialog}
          onSave={(name) => mutate((p) => renameFolder(p, dialog.id, name, now())).catch(fail)}
        />
      )}
      {dialog?.kind === 'rename-file' && (
        <NameDialog
          title="Rename file"
          label="File name"
          initial={dialog.file.name}
          confirm="Save"
          hint={kindOf(dialog.file.name) ? `Keep the .${dialog.file.name.split('.').pop()} ending so it opens correctly.` : undefined}
          onClose={closeDialog}
          onSave={(name) => mutate((p) => renameFile(p, dialog.file.id, name, now())).catch(fail)}
        />
      )}
      {dialog?.kind === 'move' && (
        <MoveDialog project={project} file={dialog.file} onClose={closeDialog} onMove={(to) => mutate((p) => moveFile(p, dialog.file.id, to, now())).catch(fail)} />
      )}
      {dialog?.kind === 'versions' && (
        <Dialog title={`Versions of ${dialog.file.name}`} onClose={closeDialog}>
          <ul className="space-y-1.5" aria-label="Versions">
            {[...dialog.file.versions].reverse().map((v, i) => (
              <li key={v.assetId} className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-3.5 py-2.5 shadow-card">
                <span className="text-sm">
                  <span className="font-extrabold">
                    Version {dialog.file.versions.length - i}
                    {i === 0 && ' (current)'}
                  </span>
                  <span className="block text-xs font-semibold text-muted">
                    {formatBytes(v.size)} · {formatWhen(v.at)}
                  </span>
                </span>
                {downloads && (
                  <Button size="sm" onClick={() => download(dialog.file, v.assetId)} aria-label={`Download version ${dialog.file.versions.length - i}`}>
                    <Download aria-hidden="true" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs font-semibold text-muted">The last 10 versions are kept.</p>
        </Dialog>
      )}
      {dialog?.kind === 'preview' && <PreviewDialog file={dialog.file} onClose={closeDialog} onDownload={downloads ? () => download(dialog.file) : undefined} />}
      {dialog?.kind === 'delete-file' && (
        <ConfirmDialog
          title={`Delete ${dialog.file.name}?`}
          body={`This permanently deletes the file${dialog.file.versions.length > 1 ? ` and all ${dialog.file.versions.length} versions` : ''}.`}
          confirm="Delete file"
          onClose={closeDialog}
          onConfirm={async () => {
            let ids: string[] = [];
            await mutate((p) => {
              const r = deleteFile(p, dialog.file.id, now());
              ids = r.assetIds;
              return r.project;
            }).catch(fail);
            await deleteAssets(assets, ids);
          }}
        />
      )}
      {dialog?.kind === 'delete-folder' && (
        <ConfirmDialog
          title={`Delete “${dialog.name}”?`}
          body="This permanently deletes the folder and everything inside it, including subfolders and files."
          confirm="Delete folder"
          onClose={closeDialog}
          onConfirm={async () => {
            let ids: string[] = [];
            const parent = project.folders.find((f) => f.id === dialog.id)?.parentId ?? null;
            await mutate((p) => {
              const r = deleteFolder(p, dialog.id, now());
              ids = r.assetIds;
              return r.project;
            }).catch(fail);
            openFolder(parent);
            await deleteAssets(assets, ids);
          }}
        />
      )}
      {dialog?.kind === 'delete-project' && (
        <ConfirmDialog
          title={`Delete “${project.name}”?`}
          body={`This permanently deletes the project and its ${project.files.length} ${project.files.length === 1 ? 'file' : 'files'}. This can’t be undone.`}
          confirm="Delete project"
          onClose={closeDialog}
          onConfirm={async () => {
            const ids = project.files.flatMap((f) => f.versions.map((v) => v.assetId));
            await remove();
            await deleteAssets(assets, ids);
            navigate('/projects');
          }}
        />
      )}
    </div>
  );
}

function fileIcon(file: ProjectFile) {
  const group = kindOf(file.name)?.group;
  return group === 'image' ? ImageIcon : group === 'video' ? Film : group === 'font' ? Type : group === 'text' || group === 'document' ? FileText : FileIcon;
}

function FileRow(props: {
  file: ProjectFile;
  canDownload: boolean;
  canUpload: boolean;
  onOpen: () => void;
  onDownload: () => void;
  onReplace: () => void;
  onRename: () => void;
  onMove: () => void;
  onVersions: () => void;
  onDelete: () => void;
}) {
  const { file } = props;
  const [open, setOpen] = useState(false);
  const Icon = fileIcon(file);
  const isImage = kindOf(file.name)?.group === 'image';
  const v = current(file);
  const action = (label: string, icon: ReactNode, onClick: () => void) => (
    <button
      type="button"
      onClick={() => {
        setOpen(false);
        onClick();
      }}
      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm font-bold hover:bg-line [&_svg]:size-4"
    >
      {icon}
      {label}
    </button>
  );

  return (
    <li className="rounded-2xl bg-surface shadow-card">
      <div className="flex items-center gap-3 p-2.5 pr-2">
        <button type="button" onClick={props.onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Open ${file.name}`}>
          <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-2 text-muted">
            {isImage ? (
              <img src={assetUrl(v.assetId)} alt="" loading="lazy" className="size-full object-cover" />
            ) : (
              <Icon className="size-5" aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[0.9375rem] font-extrabold">{file.name}</span>
            <span className="block truncate text-xs font-semibold text-muted">
              {formatBytes(v.size)} · {formatWhen(file.updatedAt)}
              {file.versions.length > 1 && ` · v${file.versions.length}`}
            </span>
          </span>
        </button>
        {props.canDownload && (
          <button
            type="button"
            onClick={props.onDownload}
            aria-label={`Download ${file.name}`}
            title="Download"
            className="grid size-10 shrink-0 place-items-center rounded-full text-fg hover:bg-surface-2"
          >
            <Download className="size-[18px]" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`More actions for ${file.name}`}
          className={cn('grid size-10 shrink-0 place-items-center rounded-full hover:bg-surface-2', open && 'bg-surface-2')}
        >
          <MoreHorizontal className="size-[18px]" aria-hidden="true" />
        </button>
      </div>
      {open && (
        <div className="flex animate-fade-in flex-wrap gap-1.5 border-t border-line px-2.5 py-2.5">
          {props.canUpload && action('Upload new version', <RefreshCw aria-hidden="true" />, props.onReplace)}
          {action('Rename', <Pencil aria-hidden="true" />, props.onRename)}
          {action('Move', <FolderIcon aria-hidden="true" />, props.onMove)}
          {file.versions.length > 1 && action(`Versions (${file.versions.length})`, <History aria-hidden="true" />, props.onVersions)}
          {action('Delete', <Trash2 aria-hidden="true" />, props.onDelete)}
        </div>
      )}
    </li>
  );
}

function NameDialog(props: {
  title: string;
  label: string;
  initial: string;
  confirm: string;
  hint?: string;
  onClose: () => void;
  onSave: (name: string) => unknown;
}) {
  const [name, setName] = useState(props.initial);
  const save = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) return;
    props.onSave(name);
    props.onClose();
  };
  return (
    <Dialog
      title={props.title}
      onClose={props.onClose}
      actions={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => save()} disabled={!name.trim()}>
            {props.confirm}
          </Button>
        </>
      }
    >
      <form onSubmit={save}>
        <TextField label={props.label} value={name} onChange={setName} maxLength={120} hint={props.hint} />
      </form>
    </Dialog>
  );
}

function ConfirmDialog(props: { title: string; body: string; confirm: string; onClose: () => void; onConfirm: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      title={props.title}
      onClose={props.onClose}
      actions={
        <>
          <Button onClick={props.onClose} data-autofocus>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await props.onConfirm();
              props.onClose();
            }}
          >
            {busy ? 'Deleting…' : props.confirm}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-muted">{props.body}</p>
    </Dialog>
  );
}

function MoveDialog({ project, file, onClose, onMove }: { project: Project; file: ProjectFile; onClose: () => void; onMove: (to: string | null) => unknown }) {
  const [to, setTo] = useState<string | null>(file.folderId);
  const options: Array<{ id: string | null; label: string; depth: number }> = [{ id: null, label: 'All files (top level)', depth: 0 }];
  const walk = (parent: string | null, depth: number) => {
    for (const f of childFolders(project, parent)) {
      options.push({ id: f.id, label: f.name, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 1);
  return (
    <Dialog
      title={`Move ${file.name}`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={to === file.folderId}
            onClick={() => {
              onMove(to);
              onClose();
            }}
          >
            Move here
          </Button>
        </>
      }
    >
      <div role="radiogroup" aria-label="Destination folder" className="max-h-72 space-y-1 overflow-y-auto pr-1">
        {options.map((o) => (
          <label
            key={o.id ?? 'root'}
            style={{ paddingLeft: `${0.75 + o.depth * 1}rem` }}
            className={cn('flex h-10 cursor-pointer items-center gap-2 rounded-xl pr-3 text-sm font-bold', to === o.id ? 'bg-ink text-ink-contrast' : 'hover:bg-surface-2')}
          >
            <input type="radio" name="move-to" className="sr-only" checked={to === o.id} onChange={() => setTo(o.id)} />
            <FolderIcon className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{o.label}</span>
          </label>
        ))}
      </div>
    </Dialog>
  );
}

function PreviewDialog({ file, onClose, onDownload }: { file: ProjectFile; onClose: () => void; onDownload?: () => void }) {
  const group = kindOf(file.name)?.group;
  const url = assetUrl(current(file).assetId);
  const Icon = fileIcon(file);
  return (
    <Dialog
      title={file.name}
      onClose={onClose}
      actions={
        onDownload && (
          <Button variant="primary" onClick={onDownload}>
            <Download aria-hidden="true" /> Download
          </Button>
        )
      }
    >
      {group === 'image' ? (
        <img src={url} alt={file.name} className="max-h-[60vh] w-full rounded-2xl bg-surface-2 object-contain" />
      ) : group === 'video' ? (
        <video src={url} controls className="max-h-[60vh] w-full rounded-2xl bg-black" />
      ) : (
        <div className="grid place-items-center rounded-2xl bg-surface-2 py-10 text-muted">
          <Icon className="size-10" aria-hidden="true" />
          <p className="mt-2 text-sm font-bold">No preview for this file type. Download it to open.</p>
        </div>
      )}
      <p className="mt-3 text-xs font-semibold text-muted">
        {formatBytes(current(file).size)} · version {file.versions.length} · updated {formatWhen(file.updatedAt)}
      </p>
    </Dialog>
  );
}

