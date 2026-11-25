/**
 * The shape of a cloud project and pure functions that change it.
 * Each function returns a NEW project, which is then saved as one document.
 * (Kept free of any storage code so it can be unit-tested.)
 */
import type { ProjectTemplate, TemplateFolder } from './templates';

export interface Folder {
  id: string;
  name: string;
  /** null = top level of the project */
  parentId: string | null;
}

export interface FileVersion {
  assetId: string;
  size: number;
  at: string;
}

export interface ProjectFile {
  id: string;
  name: string;
  folderId: string | null;
  type: string;
  /** Newest last. The current file is the last version. */
  versions: FileVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  templateId: string;
  createdAt: string;
  updatedAt: string;
  folders: Folder[];
  files: ProjectFile[];
}

export const newId = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const current = (f: ProjectFile) => f.versions[f.versions.length - 1];
export const fileSize = (f: ProjectFile) => current(f)?.size ?? 0;
export const projectSize = (p: Project) => p.files.reduce((n, f) => n + f.versions.reduce((m, v) => m + v.size, 0), 0);

export const cleanName = (name: string) => name.replace(/[\\/]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);

/** Validate a stored document into a Project (ignoring anything malformed). */
export function toProject(id: string, data: Record<string, unknown> | undefined): Project | null {
  if (!data || typeof data.name !== 'string') return null;
  const arr = <T,>(v: unknown, ok: (x: any) => boolean): T[] => (Array.isArray(v) ? (v.filter(ok) as T[]) : []); // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    id,
    name: data.name,
    templateId: typeof data.templateId === 'string' ? data.templateId : 'blank',
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? data.createdAt ?? ''),
    folders: arr<Folder>(data.folders, (f) => f && typeof f.id === 'string' && typeof f.name === 'string'),
    files: arr<ProjectFile>(
      data.files,
      (f) => f && typeof f.id === 'string' && typeof f.name === 'string' && Array.isArray(f.versions) && f.versions.length > 0,
    ),
  };
}

export const toDoc = (p: Project): Record<string, unknown> => {
  const { id: _id, ...rest } = p;
  void _id;
  return rest as unknown as Record<string, unknown>;
};

/** Build a new project from a template's folder tree. Returns the folder ids by path for starter files. */
export function createProject(template: ProjectTemplate, name: string, now: string, makeId = newId) {
  const folders: Folder[] = [];
  const byPath = new Map<string, string>();
  const walk = (list: TemplateFolder[], parentId: string | null, prefix: string) => {
    for (const f of list) {
      const id = makeId('f');
      const path = prefix ? `${prefix}/${f.name}` : f.name;
      folders.push({ id, name: f.name, parentId });
      byPath.set(path, id);
      if (f.children) walk(f.children, id, path);
    }
  };
  walk(template.folders, null, '');
  const project: Project = {
    id: makeId('p'),
    name: cleanName(name) || template.name,
    templateId: template.id,
    createdAt: now,
    updatedAt: now,
    folders,
    files: [],
  };
  return { project, folderByPath: byPath };
}

/** Make `name` unique among `taken` by adding " (2)", " (3)"… before the extension. */
export function uniqueName(name: string, taken: string[]): string {
  const lower = new Set(taken.map((t) => t.toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  const m = /^(.*?)(\.[^.]+)?$/.exec(name)!;
  for (let i = 2; ; i++) {
    const candidate = `${m[1]} (${i})${m[2] ?? ''}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}

export const childFolders = (p: Project, parentId: string | null) =>
  p.folders.filter((f) => f.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

export const filesIn = (p: Project, folderId: string | null) =>
  p.files.filter((f) => f.folderId === folderId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

/** Folder chain from the top level down to `folderId` (for breadcrumbs). */
export function folderPath(p: Project, folderId: string | null): Folder[] {
  const chain: Folder[] = [];
  let id = folderId;
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const f = p.folders.find((x) => x.id === id);
    if (!f) break;
    chain.unshift(f);
    id = f.parentId;
  }
  return chain;
}

/** A folder and everything inside it, at any depth. */
export function descendantFolderIds(p: Project, folderId: string): Set<string> {
  const ids = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of p.folders) if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) ids.add(f.id), (grew = true);
  }
  return ids;
}

const touch = (p: Project, now: string): Project => ({ ...p, updatedAt: now });

export function addFolder(p: Project, name: string, parentId: string | null, now: string, makeId = newId): Project {
  const taken = childFolders(p, parentId).map((f) => f.name);
  const folder: Folder = { id: makeId('f'), name: uniqueName(cleanName(name) || 'New folder', taken), parentId };
  return touch({ ...p, folders: [...p.folders, folder] }, now);
}

export function renameFolder(p: Project, folderId: string, name: string, now: string): Project {
  const target = p.folders.find((f) => f.id === folderId);
  if (!target || !cleanName(name)) return p;
  const taken = childFolders(p, target.parentId).filter((f) => f.id !== folderId).map((f) => f.name);
  const finalName = uniqueName(cleanName(name), taken);
  return touch({ ...p, folders: p.folders.map((f) => (f.id === folderId ? { ...f, name: finalName } : f)) }, now);
}

/** Remove a folder with everything in it. Also returns the stored file ids to delete. */
export function deleteFolder(p: Project, folderId: string, now: string): { project: Project; assetIds: string[] } {
  const ids = descendantFolderIds(p, folderId);
  const removed = p.files.filter((f) => f.folderId && ids.has(f.folderId));
  return {
    project: touch({ ...p, folders: p.folders.filter((f) => !ids.has(f.id)), files: p.files.filter((f) => !removed.includes(f)) }, now),
    assetIds: removed.flatMap((f) => f.versions.map((v) => v.assetId)),
  };
}

export function addFile(
  p: Project,
  file: { name: string; type: string; assetId: string; size: number },
  folderId: string | null,
  now: string,
  makeId = newId,
): Project {
  const taken = filesIn(p, folderId).map((f) => f.name);
  const entry: ProjectFile = {
    id: makeId('d'),
    name: uniqueName(cleanName(file.name) || 'Untitled', taken),
    folderId,
    type: file.type,
    versions: [{ assetId: file.assetId, size: file.size, at: now }],
    createdAt: now,
    updatedAt: now,
  };
  return touch({ ...p, files: [...p.files, entry] }, now);
}

/** Keep the file's name and place, add the upload as its newest version. */
export const MAX_VERSIONS = 10;
export function addVersion(
  p: Project,
  fileId: string,
  upload: { assetId: string; size: number; type: string },
  now: string,
): { project: Project; droppedAssetIds: string[] } {
  let dropped: string[] = [];
  const files = p.files.map((f) => {
    if (f.id !== fileId) return f;
    const versions = [...f.versions, { assetId: upload.assetId, size: upload.size, at: now }];
    dropped = versions.slice(0, Math.max(0, versions.length - MAX_VERSIONS)).map((v) => v.assetId);
    return { ...f, type: upload.type, versions: versions.slice(-MAX_VERSIONS), updatedAt: now };
  });
  return { project: touch({ ...p, files }, now), droppedAssetIds: dropped };
}

export function renameFile(p: Project, fileId: string, name: string, now: string): Project {
  const target = p.files.find((f) => f.id === fileId);
  if (!target || !cleanName(name)) return p;
  const taken = filesIn(p, target.folderId).filter((f) => f.id !== fileId).map((f) => f.name);
  const finalName = uniqueName(cleanName(name), taken);
  return touch({ ...p, files: p.files.map((f) => (f.id === fileId ? { ...f, name: finalName, updatedAt: now } : f)) }, now);
}

export function moveFile(p: Project, fileId: string, folderId: string | null, now: string): Project {
  const target = p.files.find((f) => f.id === fileId);
  if (!target || target.folderId === folderId) return p;
  const taken = filesIn(p, folderId).map((f) => f.name);
  const name = uniqueName(target.name, taken);
  return touch({ ...p, files: p.files.map((f) => (f.id === fileId ? { ...f, folderId, name, updatedAt: now } : f)) }, now);
}

export function deleteFile(p: Project, fileId: string, now: string): { project: Project; assetIds: string[] } {
  const target = p.files.find((f) => f.id === fileId);
  return {
    project: touch({ ...p, files: p.files.filter((f) => f.id !== fileId) }, now),
    assetIds: target ? target.versions.map((v) => v.assetId) : [],
  };
}
