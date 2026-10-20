import type { ValueOf } from './define.ts';

/** Languages of the driver PWA, driver emails and safety briefing content. */
export const DriverLocale = {
  de: 'de',
  en: 'en',
  pl: 'pl',
  ro: 'ro',
  bg: 'bg',
  lt: 'lt',
  uk: 'uk',
  ru: 'ru',
  cs: 'cs',
  sk: 'sk',
  hu: 'hu',
  tr: 'tr',
} as const;
export type DriverLocale = ValueOf<typeof DriverLocale>;

/** Languages of the staff and carrier UI, emails to staff and carriers, and load type names. */
export const StaffLocale = {
  de: DriverLocale.de,
  en: DriverLocale.en,
  pl: DriverLocale.pl,
} as const;
export type StaffLocale = ValueOf<typeof StaffLocale>;

/** `staff` modules ship de, en and pl catalogs. `driver` ships the 12 driver languages. */
export const LocaleSet = {
  staff: 'staff',
  driver: 'driver',
} as const;
export type LocaleSet = ValueOf<typeof LocaleSet>;

/** The parts of a derived catalog entry (`nav.json`, `entitlements.json`, `settings.json`). */
export const LabelPart = {
  label: 'label',
  description: 'description',
} as const;
export type LabelPart = ValueOf<typeof LabelPart>;

/** The catalog part files `pnpm i18n:derive` writes from the manifests, in the order it writes them. */
export const DerivedPart = {
  module: 'module',
  nav: 'nav',
  entitlements: 'entitlements',
  settings: 'settings',
} as const;
export type DerivedPart = ValueOf<typeof DerivedPart>;
