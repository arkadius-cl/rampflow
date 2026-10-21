import * as z from 'zod';
import { type LocalTime, type TimeZone, timeZoneSchema } from '../../time/index.ts';
import { type HoursRow, WeeklyHours } from '../../time/weekly-hours.ts';
import { StaffLocale } from '../../values/locales.ts';
import {
  DockStatus,
  DoorType,
  type PresetHoursTemplate,
  type SiteCountry,
  TemperatureZone,
} from './values.ts';

// Request schemas and response shapes of /api/t/:orgId/sites (MD-01, MD-02).

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

/** ISO 3166-2, the form the holiday calendar and the site share. */
export const SubdivisionCode = z
  .string()
  .regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/, 'ISO 3166-2, for example DE-BY');

const siteFields = {
  name: text(120),
  addressLine1: text(200),
  addressLine2: optionalText(200),
  postalCode: text(20),
  city: text(120),
  country: z.string().regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2, for example DE'),
  subdivision: SubdivisionCode.nullable().optional(),
  timeZone: timeZoneSchema,
  defaultLocale: z.enum(StaffLocale),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, 'E.164, for example +4940123456')
    .nullable()
    .optional(),
};

const subdivisionInCountry = (s: { country?: string; subdivision?: string | null }) =>
  !s.subdivision || !s.country || s.subdivision.startsWith(`${s.country}-`);
const subdivisionIssue = {
  message: 'The subdivision must belong to the country',
  path: ['subdivision'],
};

/** A new site brings its weekly hours, so it offers slots once it has a dock (MD-01). */
export const CreateSite = z
  .object({ ...siteFields, hours: WeeklyHours.min(1) })
  .refine(subdivisionInCountry, subdivisionIssue);
export type CreateSite = z.infer<typeof CreateSite>;

const weekdays = (from: number, to: number, opens: string, closes: string): HoursRow[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({
    weekday: from + i,
    opens: opens as LocalTime,
    closes: closes as LocalTime,
  }));

/** The rows each preset of the site form fills in. */
export const hoursTemplateRows = {
  one_shift: weekdays(1, 5, '06:00', '14:00'),
  two_shifts: weekdays(1, 5, '06:00', '22:00'),
} as const satisfies Record<PresetHoursTemplate, HoursRow[]>;

/** A subdivision change is checked against the stored country by the API. */
export const UpdateSite = z
  .object({ ...siteFields, active: z.boolean() })
  .partial()
  .refine(subdivisionInCountry, subdivisionIssue);
export type UpdateSite = z.infer<typeof UpdateSite>;

export interface SiteView {
  id: string;
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  postalCode: string;
  city: string;
  country: string;
  subdivision: string | null;
  timeZone: TimeZone;
  defaultLocale: StaffLocale;
  phone: string | null;
  active: boolean;
}

/**
 * What `GET /sites` counts against `core.max_sites` and `core.max_docks`: active sites, and
 * active and maintenance docks, of the sites the caller can see.
 */
export interface SiteUsage {
  sites: number;
  docks: number;
}

/** A subdivision with its own public holidays, `code` in ISO 3166-2 (`DE-BY`), `name` native. */
export interface HolidayRegion {
  code: string;
  name: string;
}

export interface HolidayRegions {
  items: HolidayRegion[];
}

/** The countries the platform admits sites in, `core.site_countries`. */
export interface SiteCountries {
  items: SiteCountry[];
}

export const CreateHall = z.object({ name: text(80), sort: z.int().min(0).optional() });
export const UpdateHall = CreateHall.partial();
export type CreateHall = z.infer<typeof CreateHall>;
export type UpdateHall = z.infer<typeof UpdateHall>;

export interface HallView {
  id: string;
  siteId: string;
  name: string;
  sort: number;
}

const dockFields = {
  hallId: z.uuid(),
  code: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .regex(/^[A-Za-z0-9][A-Za-z0-9 ._/-]*$/, 'Letters, digits, space, dot, dash, slash'),
  doorType: z.enum(DoorType),
  temperatureZone: z.enum(TemperatureZone),
  adrAllowed: z.boolean(),
  status: z.enum(DockStatus),
  sort: z.int().min(0),
};

export const CreateDock = z.object({
  ...dockFields,
  adrAllowed: dockFields.adrAllowed.default(false),
  status: dockFields.status.default(DockStatus.active),
  sort: dockFields.sort.optional(),
});
export const UpdateDock = z.object(dockFields).partial();
export type CreateDock = z.infer<typeof CreateDock>;
export type UpdateDock = z.infer<typeof UpdateDock>;

export interface DockView {
  id: string;
  siteId: string;
  hallId: string;
  code: string;
  doorType: DoorType;
  temperatureZone: TemperatureZone;
  adrAllowed: boolean;
  status: DockStatus;
  sort: number;
  /** The bookable resource the dock belongs to, if any (MD-03). */
  resourceId: string | null;
}
