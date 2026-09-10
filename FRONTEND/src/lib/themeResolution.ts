export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme-storage';

/**
 * Parses raw localStorage string into a valid ThemePreference.
 * Handles absent values, valid JSON shapes ({ state: { theme } }, { theme }),
 * quoted strings ("light"), unquoted strings ('light'), and fallbacks to 'dark'.
 */
export function parseThemeFromRaw(raw: string | null | undefined): ThemePreference {
  if (!raw) return 'dark';
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const t = parsed?.state?.theme ?? parsed?.theme;
      if (t === 'light' || t === 'dark' || t === 'system') return t;
    }
    if (parsed === 'light' || parsed === 'dark' || parsed === 'system') {
      return parsed;
    }
  } catch {
    const trimmed = String(raw).trim().toLowerCase();
    if (trimmed === 'light' || trimmed === 'dark' || trimmed === 'system') {
      return trimmed as ThemePreference;
    }
  }
  return 'dark';
}

/**
 * Safely parses the stored theme preference from localStorage.
 * Default fallback is 'dark'.
 */
export function readStoredThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'dark';
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return parseThemeFromRaw(raw);
  } catch {
    return 'dark';
  }
}

/**
 * Resolves a ThemePreference into the concrete visual theme ('light' or 'dark').
 */
export function resolveTheme(preference: ThemePreference, systemIsDark: boolean): ResolvedTheme {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  return systemIsDark ? 'dark' : 'light';
}

/**
 * Applies the resolved theme to the DOM root (`<html>`).
 * Sets class 'dark' and native style `colorScheme`.
 */
export function applyThemeToDom(resolved: ResolvedTheme): void {
  if (typeof window === 'undefined') return;
  const root = window.document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  }
}

/**
 * Inspects system prefers-color-scheme.
 */
export function getSystemIsDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

/**
 * Synchronously executes the theme bootstrap before first paint.
 */
export function bootstrapTheme(): ResolvedTheme {
  const pref = readStoredThemePreference();
  const systemIsDark = getSystemIsDark();
  const resolved = resolveTheme(pref, systemIsDark);
  applyThemeToDom(resolved);
  return resolved;
}
