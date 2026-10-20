import * as z from 'zod';
import {
  closingTimeSchema,
  type LocalDate,
  type LocalDateTime,
  type LocalTime,
  localDateSchema,
  localDateTimeSchema,
  localTimeSchema,
  type TimeZone,
} from '../../time/index.ts';
import { values } from '../../values/define.ts';
import { ClosureKind, type ClosureSource, Direction, ResourceKind } from './values.ts';

// Request schemas and response shapes of /api/t/:orgId/capacity (MD-03, MD-04, MD-05).

export { ClosureKind, Direction, ResourceKind };
export const DIRECTIONS = values(Direction);
export const RESOURCE_KINDS = values(ResourceKind);
export const CLOSURE_KINDS = values(ClosureKind);

/** Longest duration and buffer: a booking blocks capacity for at most 16 hours (ADR-0004). */
export const MAX_DURATION_MINUTES = 720;
export const MAX_BUFFER_MINUTES = 240;

const minutes = z.int().min(5).max(MAX_DURATION_MINUTES).multipleOf(5);

export const LoadTypeDuration = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fixed'), minutes }),
  z.object({
    kind: z.literal('tiers'),
    tiers: z
      .array(z.object({ upTo: z.int().min(1).nullable(), minutes }))
      .min(1)
      .max(10)
      .refine((tiers) => tiers.at(-1)?.upTo === null, {
        message: 'The last tier has no upper bound',
      })
      .refine(
        (tiers) =>
          tiers
            .slice(0, -1)
            .every(
              (tier, i) => tier.upTo !== null && (i === 0 || tier.upTo > (tiers[i - 1]?.upTo ?? 0)),
            ),
        { message: 'Upper bounds ascend and only the last tier is open' },
      ),
  }),
]);
export type LoadTypeDuration = z.infer<typeof LoadTypeDuration>;

const directions = z
  .array(z.enum(DIRECTIONS))
  .min(1)
  .refine((d) => new Set(d).size === d.length, 'Each direction once');

const ids = z.array(z.uuid()).refine((d) => new Set(d).size === d.length, 'Each id once');

export const CreateResource = z
  .object({
    siteId: z.uuid(),
    kind: z.enum(RESOURCE_KINDS),
    name: z.string().trim().min(1).max(80),
    directions,
    capacityCap: z.int().min(1).nullable().optional(),
    dailyCap: z.int().min(1).nullable().optional(),
    sort: z.int().min(0).optional(),
    dockIds: ids.min(1),
  })
  .refine((r) => r.kind === ResourceKind.pool || r.dockIds.length === 1, {
    message: 'A single resource has exactly one dock',
    path: ['dockIds'],
  })
  .refine((r) => r.kind === ResourceKind.pool || r.capacityCap == null, {
    message: 'Only pools have a capacity cap',
    path: ['capacityCap'],
  });
export type CreateResource = z.infer<typeof CreateResource>;

export const UpdateResource = z
  .object({
    name: z.string().trim().min(1).max(80),
    directions,
    capacityCap: z.int().min(1).nullable(),
    dailyCap: z.int().min(1).nullable(),
    sort: z.int().min(0),
    active: z.boolean(),
  })
  .partial();
export type UpdateResource = z.infer<typeof UpdateResource>;

export const PutResourceDocks = z.object({ dockIds: ids.min(1) });

/**
 * How one dock is booked (MD-03): not at all, on its own as a single resource, or as a member of
 * one pool. `PUT /capacity/docks/:dockId/booking` moves the dock in one transaction.
 */
export const DockBooking = z.discriminatedUnion('as', [
  z.object({ as: z.literal('none') }),
  // Without directions a reused single keeps its own and a new one serves both.
  z.object({ as: z.literal('single'), directions: directions.optional() }),
  z.object({ as: z.literal('pool'), resourceId: z.uuid() }),
]);
export type DockBooking = z.infer<typeof DockBooking>;

export interface ResourceView {
  id: string;
  siteId: string;
  kind: ResourceKind;
  name: string;
  directions: Direction[];
  capacityCap: number | null;
  dailyCap: number | null;
  sort: number;
  active: boolean;
  dockIds: string[];
}

export const SiteQuery = z.object({ siteId: z.uuid() });

export const HoursRow = z
  .object({ weekday: z.int().min(1).max(7), opens: localTimeSchema, closes: closingTimeSchema })
  .refine((r) => r.opens < r.closes, { message: 'Opens before it closes', path: ['closes'] });

export const PutHours = z.object({
  siteId: z.uuid(),
  resourceId: z.uuid().nullable(),
  rows: z
    .array(HoursRow)
    .max(70)
    .superRefine((rows, ctx) => {
      rows.forEach((row, i) => {
        const overlaps = rows.some(
          (other, j) =>
            j < i &&
            other.weekday === row.weekday &&
            other.opens < row.closes &&
            row.opens < other.closes,
        );
        if (overlaps) {
          ctx.addIssue({ code: 'custom', message: 'Overlaps another window', path: [i] });
        }
      });
    }),
});
export type PutHours = z.infer<typeof PutHours>;

export interface HoursRowView {
  resourceId: string | null;
  weekday: number;
  opens: LocalTime;
  closes: LocalTime;
}

export const ClosureQuery = z
  .object({ siteId: z.uuid(), from: localDateSchema, to: localDateSchema })
  .refine((q) => q.from <= q.to, { message: 'from is on or before to', path: ['to'] });

export const CreateClosure = z
  .object({
    siteId: z.uuid(),
    resourceId: z.uuid().nullable().default(null),
    kind: z.enum(CLOSURE_KINDS),
    startsLocal: localDateTimeSchema,
    endsLocal: localDateTimeSchema,
    reason: z.string().trim().max(200).nullable().optional(),
  })
  .refine((c) => c.startsLocal < c.endsLocal, {
    message: 'Starts before it ends',
    path: ['endsLocal'],
  });
export type CreateClosure = z.infer<typeof CreateClosure>;

export interface ClosureView {
  id: string;
  siteId: string;
  resourceId: string | null;
  kind: ClosureKind;
  startsLocal: LocalDateTime;
  endsLocal: LocalDateTime;
  reason: string | null;
  source: ClosureSource;
  holidayDate: LocalDate | null;
  holidayName: string | null;
  reopenedAt: string | null;
}

const localizedName = z.object({
  de: z.string().trim().min(1).max(80),
  en: z.string().trim().min(1).max(80),
});

const loadTypeFields = {
  name: localizedName,
  direction: z.enum(DIRECTIONS),
  duration: LoadTypeDuration,
  bufferMinutes: z.int().min(0).max(MAX_BUFFER_MINUTES).multipleOf(5),
  carrierBookable: z.boolean(),
  active: z.boolean(),
  sort: z.int().min(0),
};

export const CreateLoadType = z.object({
  siteId: z.uuid(),
  ...loadTypeFields,
  bufferMinutes: loadTypeFields.bufferMinutes.default(0),
  carrierBookable: loadTypeFields.carrierBookable.default(true),
  active: loadTypeFields.active.default(true),
  sort: loadTypeFields.sort.optional(),
  resourceIds: ids.default([]),
});
export type CreateLoadType = z.infer<typeof CreateLoadType>;

export const UpdateLoadType = z.object(loadTypeFields).partial();
export type UpdateLoadType = z.infer<typeof UpdateLoadType>;

export const PutLoadTypeResources = z.object({ resourceIds: ids });

export interface LoadTypeView {
  id: string;
  siteId: string;
  name: { de: string; en: string };
  direction: Direction;
  duration: LoadTypeDuration;
  bufferMinutes: number;
  carrierBookable: boolean;
  active: boolean;
  sort: number;
  resourceIds: string[];
}

export const AvailabilityQuery = z.object({
  siteId: z.uuid(),
  date: localDateSchema,
  loadTypeId: z.uuid(),
  loadUnits: z.coerce.number().pipe(z.int().min(0).max(10_000)).default(0),
  resourceId: z.uuid().optional(),
});
export type AvailabilityQuery = z.infer<typeof AvailabilityQuery>;

export interface OfferedStart {
  /** ISO 8601 UTC instant. */
  startsAt: string;
  wallTime: LocalTime;
  fold: 'earlier' | 'later' | null;
}

/** Offered start times of one load type on one site-local day (MD-04, BK-02, BK-04). */
export interface Offers {
  siteId: string;
  date: LocalDate;
  timeZone: TimeZone;
  durationMinutes: number;
  gridMinutes: number;
  resources: { resourceId: string; name: string; starts: OfferedStart[] }[];
  /** The union over `resources`, ascending by instant. */
  starts: OfferedStart[];
}
