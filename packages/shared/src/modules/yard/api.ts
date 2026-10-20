import * as z from 'zod';
import { type LocalDate, localDateSchema, type TimeZone } from '../../time/index.ts';
import { AvisInput, plateSchema } from '../avis/avis.ts';
import { CarrierRef } from '../booking/api.staff.ts';
import { type BookingStatus, type Punctuality, TURN_AWAY_REASONS } from '../booking/lifecycle.ts';
import type { SafetyStatus } from '../safety/values.ts';

// Request schemas and response shapes of /api/t/:orgId/yard (YD-01 to YD-08, BK-02 walk-in).
// Commands run through transitionBooking; these routes only pick the command and the read model.

const reason = z.string().trim().min(1).max(500);

export const ExpectedQuery = z.object({
  siteId: z.uuid(),
  /** Site-local day; today at the site when omitted. */
  date: localDateSchema.optional(),
});
export type ExpectedQuery = z.infer<typeof ExpectedQuery>;

export const SiteQuery = z.object({ siteId: z.uuid() });
export type SiteQuery = z.infer<typeof SiteQuery>;

/** A booking code (scanner input), plate, reference or carrier name. In the body: plates are personal. */
export const SearchBody = z.object({ siteId: z.uuid(), q: z.string().trim().min(2).max(120) });
export type SearchBody = z.infer<typeof SearchBody>;

export const CheckInBody = z.object({ plateSeen: plateSchema.nullable().default(null) });
export type CheckInBody = z.input<typeof CheckInBody>;

export const TurnAwayBody = z.object({ reason: z.enum(TURN_AWAY_REASONS) });
export type TurnAwayBody = z.infer<typeof TurnAwayBody>;

/** YD-05: the reason is required unless the truck is `done`; the lifecycle checks that. */
export const DepartBody = z.object({ reason: reason.optional() });
export type DepartBody = z.infer<typeof DepartBody>;

const walkInBase = z.object({
  clientRequestId: z.uuid(),
  siteId: z.uuid(),
  resourceId: z.uuid().optional(),
  loadTypeId: z.uuid(),
  carrier: CarrierRef,
  plateSeen: plateSchema,
});

/** YD-03: a checked-in walk-in needs the avis; a turned-away one only the plate and a reason. */
export const WalkInBody = z.discriminatedUnion('outcome', [
  walkInBase.extend({ outcome: z.literal('check_in'), avis: AvisInput }),
  walkInBase.extend({
    outcome: z.literal('turn_away'),
    avis: AvisInput.optional(),
    reason: z.enum(TURN_AWAY_REASONS),
  }),
]);
export type WalkInBody = z.input<typeof WalkInBody>;

export const CandidatesBody = z.object({ name: z.string().trim().min(2).max(120) });
export type CandidatesBody = z.infer<typeof CandidatesBody>;

export const LinkAcknowledgementBody = z.object({ acknowledgementId: z.uuid() });

export const CallBody = z.object({ dockId: z.uuid() });
export const DockBody = z.object({ dockId: z.uuid().optional() });
export const CompleteBody = z.object({
  actualLoadUnits: z.int().min(0).max(1_000_000),
  discrepancyNote: z.string().trim().min(1).max(1000).optional(),
});
export type CompleteBody = z.infer<typeof CompleteBody>;

/** One truck on a gate or dock list. Times are instants; `timeZone` is the site's. */
export interface YardTruck {
  id: string;
  code: string;
  status: BookingStatus;
  carrierName: string;
  /** The plate seen at the gate, else the announced one. */
  plate: string | null;
  /** Only staff of the yard see it, for the `tel:` link (YD-07). */
  driverPhone: string | null;
  loadType: { id: string; name: { de: string; en: string } };
  loadUnits: number;
  resource: { id: string; name: string; kind: 'pool' | 'single' };
  startsAt: string;
  endsAt: string;
  timeZone: TimeZone;
  walkIn: boolean;
  safety: { status: SafetyStatus; enforced: boolean };
  /** Stored at check-in; before it, what a check-in now would record (YD-01). */
  punctuality: Punctuality | null;
  punctualityMinutes: number | null;
  dock: { id: string; code: string; hall: string } | null;
  checkedInAt: string | null;
  calledAt: string | null;
  atDockAt: string | null;
  loadingAt: string | null;
  doneAt: string | null;
  departedAt: string | null;
  noShowAt: string | null;
  turnedAwayAt: string | null;
  /** The `status` entered at this instant: the badge's "since". */
  since: string;
  version: number;
}

/** YD-01: the bookings of one site-local day, by start. */
export interface ExpectedView {
  siteId: string;
  date: LocalDate;
  timeZone: TimeZone;
  items: YardTruck[];
}

/** YD-04: a truck on site with its waits. */
export interface OnSiteTruck extends YardTruck {
  /** Minutes since gate-in. */
  onSiteMinutes: number;
  /** Minutes from `max(checked_in_at, starts_at)` to `at_dock_at`, or to now while waiting. */
  waitMinutes: number;
  /** `onSiteMinutes` above `yard.standgeld_flag_minutes`. */
  standgeld: boolean;
}

export interface OnSiteView {
  siteId: string;
  timeZone: TimeZone;
  standgeldMinutes: number;
  items: OnSiteTruck[];
}

export interface SearchView {
  items: YardTruck[];
}

export interface YardDock {
  id: string;
  code: string;
  status: 'active' | 'maintenance' | 'inactive';
  temperatureZone: 'ambient' | 'chilled' | 'frozen';
  adrAllowed: boolean;
  /** The bookable resource the dock belongs to, if any. */
  resourceId: string | null;
  occupant: YardTruck | null;
}

/** YD-06: docks by hall with their truck, and the queue of checked-in trucks by slot start. */
export interface DocksView {
  siteId: string;
  timeZone: TimeZone;
  halls: { id: string; name: string; docks: YardDock[] }[];
  queue: OnSiteTruck[];
}

/** YD-07: the call answers the truck and whether the dock lies outside its resource. */
export interface CallResult {
  truck: YardTruck;
  outsideResource: boolean;
}

/** YD-03 */
export interface WalkInResult {
  truck: YardTruck;
  /** `missing`: enforcement kept the truck `confirmed` until a briefing is linked. */
  safety: SafetyStatus | null;
}

/** YD-02: a valid acknowledgement of the tenant that the gate can link to the booking. */
export interface AcknowledgementCandidate {
  id: string;
  driverName: string;
  instruction: { id: string; name: string };
  locale: string;
  completedAt: string;
  expiresAt: string | null;
}

export interface CandidatesView {
  items: AcknowledgementCandidate[];
}

export interface BriefingSession {
  url: string;
  expiresAt: string;
}
