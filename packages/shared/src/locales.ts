import { values } from './values/define.ts';
import { DriverLocale, StaffLocale } from './values/locales.ts';

export { DriverLocale, StaffLocale };
export const STAFF_LOCALES = values(StaffLocale);
export const DRIVER_LOCALES = values(DriverLocale);

/** The source language of every catalog. Missing keys are measured against it. */
export const SOURCE_LOCALE = StaffLocale.en;
