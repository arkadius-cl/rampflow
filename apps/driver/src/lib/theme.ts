import {
  isTheme,
  resolveTheme,
  THEME_DEFAULT,
  THEME_STORAGE_KEY,
} from '@rampflow/shared/modules/core/theme';
import { type Density, Theme, ThemeSurface } from '@rampflow/shared/values';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

// The driver's appearance (ADR-0021): a choice per phone in localStorage, default like the OS;
// apps/web's hooks/use-theme.ts for the office and the stations. The driver cannot import apps/web.

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribePrefersDark(onChange: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const listeners = new Set<() => void>();

function subscribeStored(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function readStored(): Theme | undefined {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return isTheme(stored) ? stored : undefined;
}

/** This phone's choice, applied to <html> while mounted: `[value, set]`. */
export function useDeviceTheme(): [Theme, (theme: Theme) => void] {
  const stored = useSyncExternalStore(subscribeStored, readStored, () => undefined);
  const prefersDark = useSyncExternalStore(
    subscribePrefersDark,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
  const value = stored ?? THEME_DEFAULT[ThemeSurface.driver];
  const resolved = resolveTheme(value, prefersDark);
  useEffect(() => {
    document.documentElement.classList.toggle(Theme.dark, resolved === Theme.dark);
  }, [resolved]);
  const set = useCallback((theme: Theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    for (const listener of listeners) listener();
  }, []);
  return [value, set];
}

/** Sets `data-density` on <html> while mounted, so portals and the body share the density. */
export function useDensity(density: Density): void {
  useEffect(() => {
    document.documentElement.dataset.density = density;
    return () => {
      delete document.documentElement.dataset.density;
    };
  }, [density]);
}
