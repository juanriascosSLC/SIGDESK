import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  type ThemePreference,
  type ResolvedTheme,
  THEME_STORAGE_KEY,
  resolveTheme,
  applyThemeToDom,
  getSystemIsDark,
  readStoredThemePreference,
} from '@/lib/themeResolution';

export type Theme = ThemePreference;
export type { ThemePreference, ResolvedTheme };

interface ThemeState {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
  _setResolvedTheme: (resolved: ResolvedTheme) => void;
}

let mediaQueryList: MediaQueryList | null = null;
let mediaListener: ((e: MediaQueryListEvent) => void) | null = null;

function setupMediaListener(preference: ThemePreference) {
  if (typeof window === 'undefined' || !window.matchMedia) return;

  if (mediaQueryList && mediaListener) {
    mediaQueryList.removeEventListener('change', mediaListener);
    mediaListener = null;
    mediaQueryList = null;
  }

  if (preference === 'system') {
    mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
    mediaListener = (e: MediaQueryListEvent) => {
      const isDark = e.matches;
      const resolved: ResolvedTheme = isDark ? 'dark' : 'light';
      useThemeStore.getState()._setResolvedTheme(resolved);
    };
    mediaQueryList.addEventListener('change', mediaListener);
  }
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark', // Default to dark for SIG-DESK mockup
      resolvedTheme: resolveTheme('dark', getSystemIsDark()),
      setTheme: (theme: ThemePreference) => {
        const resolved = resolveTheme(theme, getSystemIsDark());
        set({ theme, resolvedTheme: resolved });
        applyThemeToDom(resolved);
        setupMediaListener(theme);
      },
      _setResolvedTheme: (resolved: ResolvedTheme) => {
        set({ resolvedTheme: resolved });
        applyThemeToDom(resolved);
      },
    }),
    {
      name: THEME_STORAGE_KEY,
      partialize: (state) => ({ theme: state.theme } as ThemeState),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const resolved = resolveTheme(state.theme, getSystemIsDark());
          state.resolvedTheme = resolved;
          applyThemeToDom(resolved);
          setupMediaListener(state.theme);
        }
      },
    }
  )
);

/**
 * Shared resolved-theme API.
 * Exposes:
 * - preference: 'light' | 'dark' | 'system'
 * - resolvedTheme: 'light' | 'dark'
 * - setTheme: (theme: 'light' | 'dark' | 'system') => void
 */
export function useResolvedTheme(): {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
} {
  const preference = useThemeStore((state) => state.theme);
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const setTheme = useThemeStore((state) => state.setTheme);

  return { preference, resolvedTheme, setTheme };
}

// Initial bootstrap on import in browser environment
if (typeof window !== 'undefined') {
  const initialPref = readStoredThemePreference();
  const initialResolved = resolveTheme(initialPref, getSystemIsDark());
  applyThemeToDom(initialResolved);
  setupMediaListener(initialPref);
}
