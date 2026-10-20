import { createBrowserI18n } from '@rampflow/i18n/browser';
import status from '@rampflow/i18n/locales/status.json';
import { DRIVER_LOCALES } from '@rampflow/shared/locales';
import { DriverLocale } from '@rampflow/shared/values';
import type { i18n } from 'i18next';
import { useTranslation } from 'react-i18next';
import type app from '../../../../packages/i18n/locales/en/driver/app.json';
import type briefing from '../../../../packages/i18n/locales/en/driver/briefing.json';

// DR-02: the browser's preferred languages matched against the 12 driver locales, else en; the
// one-tap switcher stores the choice on this phone (ADR-0009).

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'driver';
    resources: { driver: { app: typeof app; briefing: typeof briefing } };
    enableSelector: 'optimize';
  }
}

const STORAGE_KEY = 'rf_driver_locale';
export const FALLBACK_LOCALE: DriverLocale = DriverLocale.en;

export const isDriverLocale = (value: unknown): value is DriverLocale =>
  typeof value === 'string' && (DRIVER_LOCALES as readonly string[]).includes(value);

/** Endonyms, so a driver finds their language whatever the current one is. */
export const LANGUAGE_NAMES: Record<DriverLocale, string> = {
  de: 'Deutsch',
  en: 'English',
  pl: 'Polski',
  ro: 'Română',
  bg: 'Български',
  lt: 'Lietuvių',
  uk: 'Українська',
  ru: 'Русский',
  cs: 'Čeština',
  sk: 'Slovenčina',
  hu: 'Magyar',
  tr: 'Türkçe',
};

/** The DR-02 badge: the locale's catalogs are machine translations nobody reviewed yet. */
export const isMachineTranslated = (locale: DriverLocale) =>
  (status as Record<string, string>)[locale] === 'machine';

export function preferredLocale(
  stored: string | null = localStorage.getItem(STORAGE_KEY),
  languages: readonly string[] = navigator.languages,
): DriverLocale {
  if (isDriverLocale(stored)) return stored;
  for (const tag of languages) {
    const language = tag.split('-')[0]?.toLowerCase();
    if (isDriverLocale(language)) return language;
  }
  return FALLBACK_LOCALE;
}

export async function initI18n(): Promise<i18n> {
  const locale = preferredLocale();
  document.documentElement.lang = locale;
  return createBrowserI18n(['driver'], locale);
}

export async function applyLocale(instance: i18n, locale: DriverLocale): Promise<void> {
  localStorage.setItem(STORAGE_KEY, locale);
  document.documentElement.lang = locale;
  await instance.changeLanguage(locale);
}

export function useLocale(): DriverLocale {
  const { i18n } = useTranslation();
  return isDriverLocale(i18n.language) ? i18n.language : FALLBACK_LOCALE;
}
