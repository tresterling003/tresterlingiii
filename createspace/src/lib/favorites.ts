/** Pure helpers for the favorites list (kept separate from React so they're easy to test). */

export const FAVORITES_KEY = 'favorites';

export const isIdList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Add or remove an id. Newly saved tools go to the front so the latest bookmark shows first. */
export const toggleId = (ids: string[], id: string): string[] =>
  ids.includes(id) ? ids.filter((x) => x !== id) : [id, ...ids];

/** Drop duplicates and ids that no longer exist in the registry (e.g. a renamed or removed tool). */
export const sanitizeIds = (ids: string[], known: Set<string>): string[] => [...new Set(ids)].filter((id) => known.has(id));
