import { describe, expect, it } from 'vitest';
import { checkFile, formatBytes, kindOf } from './files';
import {
  addFile,
  addFolder,
  addVersion,
  childFolders,
  createProject,
  deleteFile,
  deleteFolder,
  filesIn,
  folderPath,
  MAX_VERSIONS,
  moveFile,
  renameFile,
  toDoc,
  toProject,
  uniqueName,
} from './projectModel';
import { readSuggestions, validateSuggestion } from './suggestionModel';
import { getTemplate, TEMPLATES } from './templates';

let n = 0;
const id = (p: string) => `${p}${++n}`;
const NOW = '2026-11-25T12:00:00.000Z';

describe('file checks', () => {
  it('accepts supported types and rejects others with a reason', () => {
    expect(checkFile({ name: 'logo.PNG', size: 10 }).ok).toBe(true);
    expect(kindOf('clip.mp4')?.type).toBe('video/mp4');
    const psd = checkFile({ name: 'art.psd', size: 10 });
    expect(psd.ok).toBe(false);
    expect(!psd.ok && psd.reason).toMatch(/\.psd files can’t be stored/);
    expect(checkFile({ name: 'noext', size: 10 }).ok).toBe(false);
  });
  it('enforces size limits', () => {
    expect(checkFile({ name: 'a.png', size: 21 * 1024 * 1024 }).ok).toBe(false);
    expect(checkFile({ name: 'a.svg', size: 3 * 1024 * 1024 }).ok).toBe(false);
    expect(checkFile({ name: 'a.png', size: 0 }).ok).toBe(false);
  });
  it('formats sizes', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('templates', () => {
  it('have unique ids and build nested folders', () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    const { project, folderByPath } = createProject(getTemplate('animation')!, '  My Short ', NOW, id);
    expect(project.name).toBe('My Short');
    expect(childFolders(project, null)).toHaveLength(8);
    const design = folderByPath.get('03 Character Design')!;
    expect(childFolders(project, design).map((f) => f.name)).toEqual(['Expressions', 'Turnarounds']);
    expect(folderByPath.get('03 Character Design/Turnarounds')).toBeTruthy();
  });
  it('starter files point at real template folders', () => {
    for (const t of TEMPLATES) {
      const { folderByPath } = createProject(t, 'x', NOW, id);
      for (const s of t.starterFiles ?? []) expect(folderByPath.has(s.folder), `${t.id}: ${s.folder}`).toBe(true);
    }
  });
  it('blank project falls back to the template name', () => {
    expect(createProject(getTemplate('blank')!, '   ', NOW, id).project.name).toBe('Blank project');
  });
});

describe('project changes', () => {
  const base = () => createProject(getTemplate('film')!, 'Doc', NOW, id);

  it('makes names unique', () => {
    expect(uniqueName('a.png', ['A.png'])).toBe('a (2).png');
    expect(uniqueName('a.png', ['a.png', 'a (2).png'])).toBe('a (3).png');
    expect(uniqueName('Folder', ['Folder'])).toBe('Folder (2)');
  });

  it('adds, renames, moves and deletes files', () => {
    const { project, folderByPath } = base();
    const footage = folderByPath.get('Footage')!;
    let p = addFile(project, { name: 'shot.mp4', type: 'video/mp4', assetId: 'a1', size: 100 }, footage, NOW, id);
    p = addFile(p, { name: 'shot.mp4', type: 'video/mp4', assetId: 'a2', size: 100 }, footage, NOW, id);
    expect(filesIn(p, footage).map((f) => f.name)).toEqual(['shot (2).mp4', 'shot.mp4']);
    const fid = filesIn(p, footage)[0].id;
    p = renameFile(p, fid, 'take2.mp4', NOW);
    p = moveFile(p, fid, null, NOW);
    expect(filesIn(p, null).map((f) => f.name)).toEqual(['take2.mp4']);
    const del = deleteFile(p, fid, NOW);
    expect(del.assetIds).toEqual(['a2']);
    expect(del.project.files).toHaveLength(1);
  });

  it('keeps versions and caps history', () => {
    let p = addFile(base().project, { name: 'cut.mp4', type: 'video/mp4', assetId: 'v0', size: 1 }, null, NOW, id);
    const fid = p.files[0].id;
    let dropped: string[] = [];
    for (let i = 1; i <= MAX_VERSIONS + 2; i++) {
      const r = addVersion(p, fid, { assetId: `v${i}`, size: i, type: 'video/mp4' }, NOW);
      p = r.project;
      dropped = dropped.concat(r.droppedAssetIds);
    }
    expect(p.files[0].versions).toHaveLength(MAX_VERSIONS);
    expect(p.files[0].versions.at(-1)!.assetId).toBe(`v${MAX_VERSIONS + 2}`);
    expect(dropped).toEqual(['v0', 'v1', 'v2']);
  });

  it('deletes a folder with its subfolders and files', () => {
    const { project, folderByPath } = base();
    const audio = folderByPath.get('Audio')!;
    const music = folderByPath.get('Audio/Music')!;
    let p = addFile(project, { name: 'song.mp4', type: 'video/mp4', assetId: 'm1', size: 5 }, music, NOW, id);
    p = addFolder(p, 'Stems', music, NOW, id);
    expect(folderPath(p, music).map((f) => f.name)).toEqual(['Audio', 'Music']);
    const r = deleteFolder(p, audio, NOW);
    expect(r.assetIds).toEqual(['m1']);
    expect(r.project.folders.some((f) => f.name === 'Music' || f.name === 'Stems' || f.name === 'Audio')).toBe(false);
  });

  it('round-trips through storage and ignores junk', () => {
    const { project } = base();
    expect(toProject(project.id, toDoc(project))).toEqual(project);
    expect(toProject('x', { nope: 1 })).toBeNull();
    expect(toProject('x', { name: 'A', files: [{ id: 'bad' }], folders: 'no' })!.files).toEqual([]);
  });
});

describe('suggestions', () => {
  it('validates input', () => {
    expect(validateSuggestion('', '')).toMatch(/short name/);
    expect(validateSuggestion('x'.repeat(81), '')).toMatch(/under 80/);
    expect(validateSuggestion('Font pairer', 'Pairs fonts')).toBeNull();
  });
  it('reads stored data defensively', () => {
    const items = readSuggestions({ items: [{ id: '1', title: 'A', status: 'planned' }, { title: 5 }, null, { id: '2', title: 'B', status: 'weird' }] });
    expect(items.map((s) => [s.title, s.status])).toEqual([['A', 'planned'], ['B', 'new']]);
    expect(readSuggestions(undefined)).toEqual([]);
  });
});
