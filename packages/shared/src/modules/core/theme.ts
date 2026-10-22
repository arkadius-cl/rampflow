import { isValueOf, type ResolvedTheme, Theme, type ThemeSurface } from '../../values/index.ts';

// Light and dark (yrd design system, "Hell und Dunkel"): the office stores the choice in
// app_user.ui_prefs under 'app.theme' (ADR-0014), station tablets and the driver's phone per device.
// One pure resolution, one hook per app that applies it to <html>.

/** The localStorage key of a device's choice (station tablet, driver phone). */
export const THEME_STORAGE_KEY = 'rampflow.theme';

/** The choice before anyone chose: the office and the driver follow the OS, a station is light. */
export const THEME_DEFAULT: Record<ThemeSurface, Theme> = {
  office: Theme.system,
  station: Theme.light,
  driver: Theme.system,
};

export const isTheme = (value: unknown): value is Theme =>
  typeof value === 'string' && isValueOf(Theme, value);

/** The appearance to show: a stored choice wins, `system` follows `prefers-color-scheme`. */
export function resolveTheme(choice: Theme, prefersDark: boolean): ResolvedTheme {
  if (choice === Theme.system) return prefersDark ? Theme.dark : Theme.light;
  return choice;
}
