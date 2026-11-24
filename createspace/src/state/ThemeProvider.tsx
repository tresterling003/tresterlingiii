import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { onExternalChange, readJSON, writeJSON } from '@/lib/storage';
import {
  THEME_KEY,
  applyTheme,
  isThemePreference,
  onSystemThemeChange,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '@/lib/theme';

interface ThemeContextValue {
  /** What the user chose: light, dark, or follow the device. */
  preference: ThemePreference;
  /** What is actually showing right now. */
  theme: ResolvedTheme;
  setPreference: (pref: ThemePreference) => void;
  /** Flip between light and dark (an explicit choice, saved). */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const readPreference = () => readJSON<ThemePreference>(THEME_KEY, 'system', isThemePreference);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  // The device's own light/dark setting, tracked so "system" can follow it live.
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => resolveTheme('system'));
  useEffect(() => onSystemThemeChange(() => setSystemTheme(resolveTheme('system'))), []);

  const theme: ResolvedTheme = preference === 'system' ? systemTheme : preference;

  // Layout effect = applied before the browser paints, so there's no flicker when switching.
  useLayoutEffect(() => applyTheme(theme), [theme]);

  useEffect(() => onExternalChange(THEME_KEY, () => setPreferenceState(readPreference())), []);

  const setPreference = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref);
    writeJSON(THEME_KEY, pref);
  }, []);

  const toggle = useCallback(() => setPreference(theme === 'dark' ? 'light' : 'dark'), [theme, setPreference]);

  const value = useMemo(() => ({ preference, theme, setPreference, toggle }), [preference, theme, setPreference, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
