import * as z from 'zod';
import { STAFF_LOCALES, type StaffLocale } from '../../locales.ts';
import { type TimeZone, timeZoneSchema } from '../../time/index.ts';
import { values } from '../../values/define.ts';
import { CountedDockStatus, DockStatus, DoorType, TemperatureZone } from './values.ts';

// Request schemas and response shapes of /api/t/:orgId/sites (MD-01, MD-02).

export { CountedDockStatus, DockStatus, DoorType, TemperatureZone };
export const DOOR_TYPES = values(DoorType);
export const TEMPERATURE_ZONES = values(TemperatureZone);
export const DOCK_STATUSES = values(DockStatus);
export const COUNTED_DOCK_STATUSES = values(CountedDockStatus);

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

const siteFields = {
  name: text(120),
  addressLine1: text(200),
  addressLine2: optionalText(200),
  postalCode: text(20),
  city: text(120),
  country: z.string().regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2, for example DE'),
  subdivision: z
    .string()
    .regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/, 'ISO 3166-2, for example DE-BY')
    .nullable()
    .optional(),
  timeZone: timeZoneSchema,
  defaultLocale: z.enum(STAFF_LOCALES),
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

export const CreateSite = z.object(siteFields).refine(subdivisionInCountry, subdivisionIssue);
export type CreateSite = z.infer<typeof CreateSite>;

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
  doorType: z.enum(DOOR_TYPES),
  temperatureZone: z.enum(TEMPERATURE_ZONES),
  adrAllowed: z.boolean(),
  status: z.enum(DOCK_STATUSES),
  sort: z.int().min(0),
};

export const CreateDock = z.object({
  ...dockFields,
  adrAllowed: dockFields.adrAllowed.default(false),
  status: dockFields.status.default('active'),
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
