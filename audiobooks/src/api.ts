// LibriVox recordings are hosted on the Internet Archive, whose search and
// metadata APIs allow browser requests (CORS), so the app needs no server.
const IA = 'https://archive.org';

export type BookSummary = {
  id: string;
  title: string;
  author: string;
  runtime: number; // seconds, 0 if unknown
  downloads: number;
};

export type Chapter = { title: string; url: string; dur: number };

export type BookDetail = BookSummary & {
  description: string;
  cover: string;
  chapters: Chapter[];
  total: number;
  language: string;
};

export const GENRES: { label: string; subject: string }[] = [
  { label: 'Kids', subject: 'children' },
  ...['Mystery', 'Adventure', 'Science fiction', 'Fantasy', 'Horror', 'Romance', 'Humor', 'Short stories', 'Poetry', 'History', 'Biography', 'Philosophy']
    .map((g) => ({ label: g, subject: g.toLowerCase() })),
];

export const coverThumb = (id: string) => `${IA}/services/img/${encodeURIComponent(id)}`;
export const itemPage = (id: string) => `${IA}/details/${encodeURIComponent(id)}`;

/** "1:02:03", "16:31.09", "08:26" or "1132.4" -> seconds */
export function parseDuration(v: unknown): number {
  if (v == null) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  if (!s.includes(':')) return Math.round(parseFloat(s)) || 0;
  const parts = s.split(':').map((p) => parseFloat(p) || 0);
  return Math.round(parts.reduce((acc, p) => acc * 60 + p, 0));
}

const first = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? '') : String(v ?? ''));

/** Drops a trailing ", by Lewis Carroll" when it repeats the author. */
export function cleanTitle(title: string, author: string): string {
  const m = title.match(/^(.*?),?\s+by\s+(.+)$/i);
  if (!m || !author) return title.trim();
  const last = author.trim().split(/\s+/).pop()!.toLowerCase();
  return m[2].toLowerCase().includes(last) ? m[1].trim() : title.trim();
}

const cleanTerm = (s: string) => s.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, ' ').trim();

function toSummary(d: Record<string, unknown>): BookSummary {
  const author = first(d.creator) || 'Unknown author';
  return {
    id: String(d.identifier),
    title: cleanTitle(first(d.title) || String(d.identifier), author),
    author,
    runtime: parseDuration(d.runtime),
    downloads: Number(d.downloads) || 0,
  };
}

export type SearchArgs = { query?: string; genre?: string; english?: boolean; page?: number; rows?: number };

export async function searchBooks(
  { query = '', genre = '', english = true, page = 1, rows = 24 }: SearchArgs,
  signal?: AbortSignal,
): Promise<{ total: number; items: BookSummary[] }> {
  // runtime:* keeps real audiobooks and drops cover-art and bundle items.
  let q = 'collection:librivoxaudio AND runtime:*';
  if (english) q += ' AND language:(eng OR English)';
  if (genre) q += ` AND subject:"${cleanTerm(genre)}"`;
  for (const w of cleanTerm(query).split(/\s+/).filter(Boolean).slice(0, 8)) {
    q += ` AND (title:(${w}*) OR creator:(${w}*))`;
  }
  const p = new URLSearchParams({ q, rows: String(rows), page: String(page), output: 'json' });
  for (const f of ['identifier', 'title', 'creator', 'runtime', 'downloads']) p.append('fl[]', f);
  p.append('sort[]', 'downloads desc');
  const r = await fetch(`${IA}/advancedsearch.php?${p}`, { signal });
  if (!r.ok) throw new Error(`Search failed (${r.status})`);
  const d = await r.json();
  return { total: d.response?.numFound ?? 0, items: (d.response?.docs ?? []).map(toSummary) };
}

export function htmlToText(html: string): string {
  const prepared = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n\n');
  const doc = new DOMParser().parseFromString(prepared, 'text/html');
  return (doc.body.textContent ?? '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type IAFile = { name: string; format?: string; title?: string; length?: string; track?: string; size?: string };

const fileUrl = (id: string, name: string) =>
  `${IA}/download/${encodeURIComponent(id)}/${name.split('/').map(encodeURIComponent).join('/')}`;

function prettyName(name: string) {
  return name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/_64kb$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
}

const MP3_FORMATS = ['64Kbps MP3', 'VBR MP3', '128Kbps MP3', 'MP3'];

export async function getBook(id: string, signal?: AbortSignal): Promise<BookDetail> {
  const r = await fetch(`${IA}/metadata/${encodeURIComponent(id)}`, { signal });
  if (!r.ok) throw new Error(`Couldn't load this book (${r.status})`);
  const d = await r.json();
  if (!d.metadata) throw new Error('This book was not found on LibriVox.');
  const files: IAFile[] = d.files ?? [];

  let audio: IAFile[] = [];
  for (const f of MP3_FORMATS) {
    audio = files.filter((x) => x.format === f);
    if (audio.length) break;
  }
  const trackNo = (f: IAFile) => parseInt(String(f.track ?? '').split('/')[0], 10);
  audio.sort((a, b) => {
    const ta = trackNo(a);
    const tb = trackNo(b);
    if (!isNaN(ta) && !isNaN(tb) && ta !== tb) return ta - tb;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
  const chapters = audio.map((f) => ({
    title: (f.title || prettyName(f.name)).trim(),
    url: fileUrl(id, f.name),
    dur: parseDuration(f.length),
  }));

  const jpeg = files
    .filter((f) => f.format === 'JPEG' && !/thumb/i.test(f.name))
    .sort((a, b) => Number(b.size ?? 0) - Number(a.size ?? 0))[0];

  const md = d.metadata;
  const summary = toSummary(md);
  const total = chapters.reduce((s, c) => s + c.dur, 0) || summary.runtime;
  const desc = Array.isArray(md.description) ? md.description.join('\n\n') : String(md.description ?? '');

  return {
    ...summary,
    runtime: total,
    total,
    chapters,
    cover: jpeg ? fileUrl(id, jpeg.name) : coverThumb(id),
    description: htmlToText(desc),
    language: first(md.language),
  };
}
