import {
  isTheme,
  resolveTheme,
  THEME_DEFAULT,
  THEME_STORAGE_KEY,
} from '@rampflow/shared/modules/core/theme';
import { type ResolvedTheme, Theme, type ThemeSurface, UiPref } from '@rampflow/shared/values';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useUiPref } from '@/lib/access';

// Light and dark (ADR-0021): one pure `resolveTheme`, one hook that applies it to <html>, and two
// sources for the choice: the account (`app.theme` in ui_prefs, ADR-0014) for office users, this
// device (localStorage) for station tablets and driver phones.

/** A theme choice and how to change it, whatever stores it. */
export interface ThemeController {
  value: Theme;
  set: (theme: Theme) => void;
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribePrefersDark(onChange: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Whether the OS asks for a dark appearance right now. */
export function usePrefersDark(): boolean {
  return useSyncExternalStore(
    subscribePrefersDark,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
}

/** Sets the class `dark` on <html> while mounted, following the OS when the choice is `system`. */
export function useApplyTheme(choice: Theme | undefined): void {
  const prefersDark = usePrefersDark();
  const resolved = choice === undefined ? undefined : resolveTheme(choice, prefersDark);
  useEffect(() => {
    if (resolved === undefined) return;
    document.documentElement.classList.toggle(Theme.dark, resolved === Theme.dark);
  }, [resolved]);
}

const deviceListeners = new Set<() => void>();

function subscribeDevice(onChange: () => void) {
  deviceListeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    deviceListeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function readDeviceTheme(): Theme | undefined {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return isTheme(stored) ? stored : undefined;
}

/** This device's choice (station tablet, driver phone), applied while mounted. */
export function useDeviceTheme(surface: ThemeSurface): ThemeController {
  const stored = useSyncExternalStore(subscribeDevice, readDeviceTheme, () => undefined);
  const value = stored ?? THEME_DEFAULT[surface];
  useApplyTheme(value);
  const set = useCallback((theme: Theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    for (const listener of deviceListeners) listener();
  }, []);
  return { value, set };
}

/** The signed-in user's choice from `app.theme`, applied while mounted; the office default is `system`. */
export function useAccountTheme(): ThemeController {
  const [stored, set] = useUiPref(UiPref.app_theme);
  const value = stored ?? THEME_DEFAULT.office;
  useApplyTheme(value);
  return { value, set };
}

function subscribeHtmlClass(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

/** What <html> shows right now, for libraries that take a theme name (the toaster). */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(
    subscribeHtmlClass,
    () => (document.documentElement.classList.contains(Theme.dark) ? Theme.dark : Theme.light),
    () => Theme.light,
  );
}
