/** Languages of the staff and carrier UI, emails to staff and carriers, and load type names. */
export const STAFF_LOCALES = ['de', 'en', 'pl'] as const;
export type StaffLocale = (typeof STAFF_LOCALES)[number];

/** Languages of the driver PWA, driver emails and safety briefing content. */
export const DRIVER_LOCALES = [
  'de',
  'en',
  'pl',
  'ro',
  'bg',
  'lt',
  'uk',
  'ru',
  'cs',
  'sk',
  'hu',
  'tr',
] as const;
export type DriverLocale = (typeof DRIVER_LOCALES)[number];

/** The source language of every catalog. Missing keys are measured against it. */
export const SOURCE_LOCALE = 'en';
