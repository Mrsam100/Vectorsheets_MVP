/**
 * ThemeProvider - Theme and density mode management
 *
 * Provides a React context for reading/writing the current theme (light/dark/
 * high-contrast) and density (compact/default/cozy).
 *
 * Architecture:
 * - Writes `data-vs-theme` and `data-vs-density` attributes on <html>
 * - CSS attribute selectors activate the matching token layer
 * - Single attribute write → browser batches one repaint (zero reflow)
 * - Preferences are persisted to localStorage
 * - Supports "system" preference (follows OS prefers-color-scheme)
 *
 * The blocking <script> in index.html sets attributes before first paint
 * so there is no flash of wrong theme.
 */

import React, { createContext, useContext, useState, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';

// =============================================================================
// Types
// =============================================================================

export type ThemeMode = 'light' | 'dark' | 'high-contrast';
export type DensityMode = 'compact' | 'default' | 'cozy';

export interface ThemeContextValue {
  /** Resolved theme currently applied to the DOM */
  theme: ThemeMode;
  /** Current density mode */
  density: DensityMode;
  /** Set theme — pass 'system' to follow OS preference */
  setTheme: (theme: ThemeMode | 'system') => void;
  /** Set density mode */
  setDensity: (density: DensityMode) => void;
  /** The raw user preference ('system' means following OS) */
  themePreference: ThemeMode | 'system';
}

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY_THEME = 'vs-theme';
const STORAGE_KEY_DENSITY = 'vs-density';

const VALID_THEMES: ReadonlySet<string> = new Set(['light', 'dark', 'high-contrast', 'system']);
const VALID_DENSITIES: ReadonlySet<string> = new Set(['compact', 'default', 'cozy']);

const DARK_MQ = '(prefers-color-scheme: dark)';

// =============================================================================
// Helpers
// =============================================================================

/** Read a validated value from localStorage */
function readStorage<T extends string>(key: string, validSet: ReadonlySet<string>, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw && validSet.has(raw)) return raw as T;
  } catch {
    // localStorage unavailable (SSR, privacy mode) — use fallback
  }
  return fallback;
}

/** Write to localStorage (silently ignore errors) */
function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore — storage full or blocked
  }
}

/** Resolve 'system' preference to an actual ThemeMode */
function resolveSystemTheme(): ThemeMode {
  if (typeof window !== 'undefined') {
    // Check high-contrast first (matches blocking script in index.html)
    if (window.matchMedia('(prefers-contrast: more)').matches) {
      return 'high-contrast';
    }
    if (window.matchMedia(DARK_MQ).matches) {
      return 'dark';
    }
  }
  return 'light';
}

// =============================================================================
// Context
// =============================================================================

const defaultValue: ThemeContextValue = {
  theme: 'light',
  density: 'default',
  setTheme: () => {},
  setDensity: () => {},
  themePreference: 'system',
};

export const ThemeContext = createContext<ThemeContextValue>(defaultValue);
ThemeContext.displayName = 'ThemeContext';

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

// =============================================================================
// Provider Component
// =============================================================================

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Read persisted preferences (or defaults)
  const [preference, setPreference] = useState<ThemeMode | 'system'>(() =>
    readStorage(STORAGE_KEY_THEME, VALID_THEMES, 'light'),
  );

  const [density, setDensityState] = useState<DensityMode>(() =>
    readStorage(STORAGE_KEY_DENSITY, VALID_DENSITIES, 'default'),
  );

  // Resolved theme — what is actually applied to the DOM
  const [resolvedTheme, setResolvedTheme] = useState<ThemeMode>(() =>
    preference === 'system' ? resolveSystemTheme() : preference,
  );

  // --- OS preference listener ---
  useEffect(() => {
    if (preference !== 'system') {
      // Not following OS — resolve directly
      setResolvedTheme(preference);
      return;
    }

    // Resolve now
    setResolvedTheme(resolveSystemTheme());

    // Listen for OS changes (both color scheme and contrast preference)
    const darkMq = window.matchMedia(DARK_MQ);
    const contrastMq = window.matchMedia('(prefers-contrast: more)');

    const handler = () => {
      setResolvedTheme(resolveSystemTheme());
    };

    darkMq.addEventListener('change', handler);
    contrastMq.addEventListener('change', handler);
    return () => {
      darkMq.removeEventListener('change', handler);
      contrastMq.removeEventListener('change', handler);
    };
  }, [preference]);

  // --- Apply attributes to <html> (layoutEffect ensures CSS is applied before paint) ---
  useLayoutEffect(() => {
    document.documentElement.dataset.vsTheme = resolvedTheme;
  }, [resolvedTheme]);

  useLayoutEffect(() => {
    if (density === 'default') {
      // Remove attribute so default sizing from tokens-light.css applies
      delete document.documentElement.dataset.vsDensity;
    } else {
      document.documentElement.dataset.vsDensity = density;
    }
  }, [density]);

  // --- Public setters ---
  const setTheme = useCallback((next: ThemeMode | 'system') => {
    setPreference(next);
    writeStorage(STORAGE_KEY_THEME, next);
  }, []);

  const setDensity = useCallback((next: DensityMode) => {
    setDensityState(next);
    writeStorage(STORAGE_KEY_DENSITY, next);
  }, []);

  // --- Stable context value ---
  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: resolvedTheme,
      density,
      setTheme,
      setDensity,
      themePreference: preference,
    }),
    [resolvedTheme, density, setTheme, setDensity, preference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

ThemeProvider.displayName = 'ThemeProvider';

export default ThemeProvider;
