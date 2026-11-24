/**
 * Release notes shown in "What's New" (dashboard and /whats-new).
 * Newest first. Keep in step with CHANGELOG.md.
 */
export interface Update {
  version: string;
  title: string;
  date: string; // ISO date, YYYY-MM-DD
  highlights: string[];
}

export const APP_VERSION = '0.1.0';

export const UPDATES: Update[] = [
  {
    version: '0.1.0',
    title: 'Foundation',
    date: '2026-11-24',
    highlights: [
      'The CreateSpace dashboard, navigation and brand',
      'Search and category filters for all 14 planned tools',
      'Bookmark tools to Favorites. They’re saved in this browser',
      'Light and dark mode',
    ],
  },
];

export const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
