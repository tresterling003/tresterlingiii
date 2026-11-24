export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** Storage name; the early-paint script in index.html reads "createspace:v1:theme" directly. */
export const THEME_KEY = 'theme';

export const isThemePreference = (v: unknown): v is ThemePreference => v === 'light' || v === 'dark' || v === 'system';

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

export const resolveTheme = (pref: ThemePreference): ResolvedTheme =>
  pref === 'system' ? (media().matches ? 'dark' : 'light') : pref;

export function applyTheme(theme: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

export function onSystemThemeChange(callback: () => void): () => void {
  const m = media();
  m.addEventListener('change', callback);
  return () => m.removeEventListener('change', callback);
}
