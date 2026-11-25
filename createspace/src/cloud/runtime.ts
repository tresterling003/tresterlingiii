/**
 * Connection to the hosting platform's built-in services (claude.ai hosted pages).
 *
 * When CreateSpace runs on its hosted link, the page is given `window.claude.use(name)`, which
 * returns sign-in info ("user"), a database ("db"), file storage ("assets") and file saving
 * ("downloads"). Anywhere else (local development, a plain static host) these are absent and the
 * cloud features show a friendly "not available here" message instead of breaking.
 *
 * Only the small part of each service CreateSpace uses is typed here.
 */

export interface DocSnapshot {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
}
export interface QuerySnapshot {
  docs: DocSnapshot[];
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
}
export interface DbError {
  code: string;
  message: string;
}
export type Unsubscribe = () => void;

export interface DocRef {
  id: string;
  path: string;
  get(): Promise<DocSnapshot>;
  set(data: Record<string, unknown>): Promise<void>;
  update(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  onSnapshot(next: (s: DocSnapshot) => void, error?: (e: DbError) => void): Unsubscribe;
}
export interface Query {
  orderBy(field: string, dir?: 'asc' | 'desc'): Query;
  limit(n: number): Query;
  get(): Promise<QuerySnapshot>;
  onSnapshot(next: (s: QuerySnapshot) => void, error?: (e: DbError) => void): Unsubscribe;
}
export interface CollectionRef extends Query {
  path: string;
  doc(id?: string): DocRef;
}
export interface Db {
  doc(path: string): DocRef;
  collection(path: string): CollectionRef;
}

export interface UploadResult {
  id: string;
  url: string;
  sizeBytes: number;
  contentType: string;
}
export interface Assets {
  upload(blob: Blob, options?: { type?: string }): Promise<UploadResult>;
  list(): Promise<{ assets: unknown[]; usage: { files: number; bytes: number; maxFiles: number; maxBytes: number } }>;
  delete(ref: string): Promise<{ deleted: boolean }>;
}

export interface Profile {
  id: string;
  name: string;
  avatarUrl: string;
}
export interface UserApi {
  id(): Promise<string | null>;
  isOwner(): Promise<boolean>;
  canEdit(): Promise<boolean>;
  can(name: string): Promise<boolean | null>;
  profiles(ids: readonly string[]): Promise<Record<string, Profile>>;
}

export interface Downloads {
  save(request: { filename: string; data: Blob | string }): Promise<{ status: string }>;
}

interface ClaudeRuntime {
  use(name: 'db'): Promise<Db | null>;
  use(name: 'assets'): Promise<Assets | null>;
  use(name: 'user'): Promise<UserApi | null>;
  use(name: 'downloads'): Promise<Downloads | null>;
  /** Test-only stand-in sets this so assets resolve to in-memory URLs. */
  assetUrl?: (id: string) => string;
}

declare global {
  interface Window {
    claude?: ClaudeRuntime;
  }
}

export const runtime = (): ClaudeRuntime | undefined => (typeof window !== 'undefined' ? window.claude : undefined);

/** Resolve a service, or null if unavailable or it doesn't answer within `ms`. */
export async function getService<T>(name: 'db' | 'assets' | 'user' | 'downloads', ms = 10000): Promise<T | null> {
  const r = runtime();
  if (!r) return null;
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));
  try {
    return ((await Promise.race([r.use(name as 'db'), timeout])) as T | null) ?? null;
  } catch {
    return null;
  }
}

/** Where an uploaded file can be loaded from. Works on every page and version of the hosted app. */
export const assetUrl = (id: string) => runtime()?.assetUrl?.(id) ?? `/_blob/${id}`;

/** Readable message for a platform error code. */
export function describeError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  switch (code) {
    case 'too_large':
      return 'That file is too big. The limit is 20 MB per file (2 MB for SVG).';
    case 'unsupported_type':
      return 'That file type can’t be stored.';
    case 'quota_or_state':
    case 'quota_exceeded':
      return 'Cloud storage is full. Delete some files and try again.';
    case 'rate_limited':
    case 'resource_exhausted':
      return 'Too many actions at once. Wait a moment and try again.';
    case 'invalid_argument':
    case 'not_granted':
      return 'You don’t have permission to save here.';
    case 'declined':
      return 'Download cancelled.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
