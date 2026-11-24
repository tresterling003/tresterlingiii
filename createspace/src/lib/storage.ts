/**
 * Small, safe wrapper around localStorage.
 *
 * Every CreateSpace key is namespaced ("createspace:v1:<name>") so we never collide with other
 * sites' data and can migrate formats later by bumping the version. All reads are defensive:
 * if storage is unavailable (private mode, blocked cookies) or the stored value is corrupted,
 * callers get the fallback instead of a crash.
 *
 * When accounts and cloud sync arrive, this is the single place that will need a new backend.
 */
const PREFIX = 'createspace:v1:';

export const storageKey = (name: string) => PREFIX + name;

export function readJSON<T>(name: string, fallback: T, isValid: (value: unknown) => value is T): T {
  try {
    const raw = window.localStorage.getItem(storageKey(name));
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(name: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(storageKey(name), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(name: string): void {
  try {
    window.localStorage.removeItem(storageKey(name));
  } catch {
    /* storage unavailable: nothing to remove */
  }
}

/** Remove every CreateSpace key (used by Settings → Reset). Leaves other sites' data alone. */
export function clearAll(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/** Run `callback` when another browser tab changes this key, so open tabs stay in sync. */
export function onExternalChange(name: string, callback: () => void): () => void {
  const key = storageKey(name);
  const handler = (event: StorageEvent) => {
    if (event.key === key || event.key === null) callback();
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
