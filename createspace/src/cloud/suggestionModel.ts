/** Tool suggestions: one document per person, holding their list of suggestions. */
export type SuggestionStatus = 'new' | 'considering' | 'planned' | 'added' | 'not-now';

export const STATUS_LABELS: Record<SuggestionStatus, string> = {
  new: 'Received',
  considering: 'Considering',
  planned: 'Planned',
  added: 'Added',
  'not-now': 'Not right now',
};

export interface Suggestion {
  id: string;
  title: string;
  details: string;
  category: string;
  status: SuggestionStatus;
  createdAt: string;
}

export const TITLE_MAX = 80;
export const DETAILS_MAX = 1000;
/** Keeps one person's document well under the storage limit and discourages spam. */
export const MAX_PER_PERSON = 50;

const isStatus = (s: unknown): s is SuggestionStatus => typeof s === 'string' && s in STATUS_LABELS;

export function readSuggestions(data: Record<string, unknown> | undefined): Suggestion[] {
  const items = Array.isArray(data?.items) ? data.items : [];
  return items
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && typeof (s as { title?: unknown }).title === 'string')
    .map((s) => ({
      id: String(s.id ?? ''),
      title: String(s.title).slice(0, TITLE_MAX),
      details: typeof s.details === 'string' ? s.details.slice(0, DETAILS_MAX) : '',
      category: typeof s.category === 'string' ? s.category : '',
      status: isStatus(s.status) ? s.status : 'new',
      createdAt: String(s.createdAt ?? ''),
    }));
}

export function validateSuggestion(title: string, details: string): string | null {
  if (!title.trim()) return 'Give your idea a short name.';
  if (title.trim().length > TITLE_MAX) return `Keep the name under ${TITLE_MAX} characters.`;
  if (details.length > DETAILS_MAX) return `Keep the details under ${DETAILS_MAX} characters.`;
  return null;
}
