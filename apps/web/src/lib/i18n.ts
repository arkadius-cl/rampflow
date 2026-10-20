import { createBrowserI18n } from '@rampflow/i18n/browser';
import { catalog, STAFF_LOCALES } from '@rampflow/shared';
import { LocaleSet, StaffLocale } from '@rampflow/shared/values';
import type { i18n } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { Resources } from './i18n-resources.gen';

// Staff and carrier UI languages (ADR-0009): de, en and pl, one namespace per module. The
// language is the user's own (`app_user.locale`), else the tenant's `i18n.default_locale`, else
// the last choice on this device, else the browser's, else German.

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'core';
    resources: Resources;
    enableSelector: 'optimize';
  }
}

export const NAMESPACES = catalog.filter((m) => m.locales === LocaleSet.staff).map((m) => m.id);
export const FALLBACK_LOCALE: StaffLocale = StaffLocale.de;
const STORAGE_KEY = 'rf_locale';

export const isStaffLocale = (value: unknown): value is StaffLocale =>
  typeof value === 'string' && (STAFF_LOCALES as readonly string[]).includes(value);

/** The language before anyone is signed in: this device's last choice, then the browser's. */
export function deviceLocale(): StaffLocale {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (isStaffLocale(stored)) return stored;
  for (const tag of navigator.languages) {
    const language = tag.split('-')[0];
    if (isStaffLocale(language)) return language;
  }
  return FALLBACK_LOCALE;
}

export function initI18n(): Promise<i18n> {
  return createBrowserI18n(NAMESPACES, deviceLocale());
}

/** Switches the UI language and remembers it on this device. */
export async function applyLocale(instance: i18n, locale: StaffLocale): Promise<void> {
  localStorage.setItem(STORAGE_KEY, locale);
  document.documentElement.lang = locale;
  if (instance.language !== locale) await instance.changeLanguage(locale);
}

/** The current UI language. */
export function useLocale(): StaffLocale {
  const { i18n } = useTranslation();
  return isStaffLocale(i18n.language) ? i18n.language : FALLBACK_LOCALE;
}
