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

export const APP_VERSION = '0.3.0';

export const UPDATES: Update[] = [
  {
    version: '0.3.0',
    title: 'Business Dashboard',
    date: '2026-11-25',
    highlights: [
      'Business Dashboard: track income, expenses, contracts and clients',
      'See what you’ve earned, what’s owed and what’s overdue at a glance',
      'Attach contract files and export income or expenses as CSV',
      'Favorites now sit at the top of Home (no separate tab)',
    ],
  },
  {
    version: '0.2.0',
    title: 'Cloud Projects & Suggestions',
    date: '2026-11-25',
    highlights: [
      'My Projects: cloud folders for your files, saved to your account',
      'Start projects from templates like Animation, Brand Identity and Film',
      'Upload, download and keep up to 10 versions of each file',
      'Suggest a Tool: send ideas for new tools',
    ],
  },
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
