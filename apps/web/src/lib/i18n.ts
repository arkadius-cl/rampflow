import { createBrowserI18n } from '@rampflow/i18n/browser';
import { catalog } from '@rampflow/shared';
import { isValueOf, LocaleSet, StaffLocale } from '@rampflow/shared/values';
import type { i18n } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { Resources } from './i18n-resources.gen';

// Staff and carrier UI languages (ADR-0009): de, en and pl, one namespace per module. The
// language is the user's own (`app_user.locale`), else the last explicit choice on this device,
// else the browser's, else the tenant's `i18n.default_locale` in a tenant area, else German.

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
  typeof value === 'string' && isValueOf(StaffLocale, value);

/** This device's last explicit choice in a language menu. */
export function storedLocale(): StaffLocale | undefined {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isStaffLocale(stored) ? stored : undefined;
}

/** The first of the browser's preferred languages the UI has. */
export function browserLocale(): StaffLocale | undefined {
  for (const tag of navigator.languages) {
    const language = tag.split('-')[0];
    if (isStaffLocale(language)) return language;
  }
  return undefined;
}

/**
 * The UI language (ADR-0009): the account's, then this device's choice, then the browser's, then
 * the tenant default, then German.
 */
export function pickLocale(
  account: StaffLocale | null | undefined,
  tenantDefault?: StaffLocale,
): StaffLocale {
  return account ?? storedLocale() ?? browserLocale() ?? tenantDefault ?? FALLBACK_LOCALE;
}

export function initI18n(): Promise<i18n> {
  return createBrowserI18n(NAMESPACES, pickLocale(undefined));
}

/** Shows the UI in `locale`, without taking it for the device's choice. */
export async function showLocale(instance: i18n, locale: StaffLocale): Promise<void> {
  document.documentElement.lang = locale;
  if (instance.language !== locale) await instance.changeLanguage(locale);
}

/** A choice in a language menu: shows it and remembers it on this device. */
export async function applyLocale(instance: i18n, locale: StaffLocale): Promise<void> {
  localStorage.setItem(STORAGE_KEY, locale);
  await showLocale(instance, locale);
}

/** The current UI language. */
export function useLocale(): StaffLocale {
  const { i18n } = useTranslation();
  return isStaffLocale(i18n.language) ? i18n.language : FALLBACK_LOCALE;
}
