import * as z from 'zod';
import {
  type LocalDate,
  type LocalTime,
  localDateSchema,
  type TimeZone,
} from '../../time/index.ts';
import { DriverLocale } from '../../values/locales.ts';
import type { WallTimeFold } from '../../values/time.ts';
import { AvisInput, type AvisView } from '../avis/avis.ts';
import type { InstructionSafety as InstructionSafetySet, SafetyStatus } from '../safety/values.ts';
import type { BookingEventData } from './events.ts';
import type { Punctuality, TurnAwayReason } from './lifecycle.ts';
import type { ActorParty, BookingEventType } from './values.ts';
import { BookingStatus } from './values.ts';

// Request schemas and response shapes of /api/t/:orgId/bookings (BK-01, BK-02, BK-03, AV-01,
// AV-02, CR-06, YD-08).

const isoInstant = z.iso.datetime({ offset: true });
const forceReason = z.string().trim().min(1).max(500);

/** A linked carrier by id, or a free-text company name for a carrier without an account. */
export const CarrierRef = z.union([
  z.object({ id: z.uuid() }),
  z.object({ name: z.string().trim().min(1).max(120) }),
]);
export type CarrierRef = z.infer<typeof CarrierRef>;

const withForce = <T extends { force?: boolean; forceReason?: string }>(body: T) =>
  !body.force || body.forceReason !== undefined;
const forceIssue = { message: 'A forced booking needs a reason', path: ['forceReason'] };

export const CreateStaffBooking = z
  .object({
    clientRequestId: z.uuid(),
    siteId: z.uuid(),
    resourceId: z.uuid().optional(),
    loadTypeId: z.uuid(),
    startsAt: isoInstant,
    carrier: CarrierRef,
    avis: AvisInput,
    force: z.boolean().default(false),
    forceReason: forceReason.optional(),
  })
  .refine(withForce, forceIssue);
export type CreateStaffBooking = z.input<typeof CreateStaffBooking>;

export const RescheduleBooking = z
  .object({
    startsAt: isoInstant,
    resourceId: z.uuid().optional(),
    version: z.int().min(1),
    force: z.boolean().default(false),
    forceReason: forceReason.optional(),
  })
  .refine(withForce, forceIssue);
export type RescheduleBooking = z.input<typeof RescheduleBooking>;

export const PutAvis = z.object({ avis: AvisInput, version: z.int().min(1) });
export type PutAvis = z.input<typeof PutAvis>;

export const CancelBooking = z.object({ reason: z.string().trim().min(1).max(500).optional() });

export const SendDriverLink = z.object({
  email: z.email().max(254),
  locale: z.enum(DriverLocale),
});
export type SendDriverLink = z.infer<typeof SendDriverLink>;

export const BoardQuery = z.object({ siteId: z.uuid(), date: localDateSchema });
export type BoardQuery = z.infer<typeof BoardQuery>;

export const BookingListQuery = z.object({
  siteId: z.uuid(),
  date: localDateSchema,
  status: z.enum(BookingStatus).optional(),
  limit: z.coerce.number().pipe(z.int().min(1).max(200)).default(50),
  cursor: z.string().max(200).optional(),
});
export type BookingListQuery = z.infer<typeof BookingListQuery>;

export const EventListQuery = z.object({
  limit: z.coerce.number().pipe(z.int().min(1).max(200)).default(50),
  cursor: z.string().max(200).optional(),
});

export const CarrierOptionsQuery = z.object({ q: z.string().trim().max(120).optional() });

/** One booking on the plan board and in the list view. */
export interface BookingSummary {
  id: string;
  code: string;
  status: BookingStatus;
  siteId: string;
  resourceId: string;
  loadTypeId: string;
  carrierId: string | null;
  carrierName: string;
  direction: 'inbound' | 'outbound';
  startsAt: string;
  endsAt: string;
  blocksUntil: string;
  timeZone: TimeZone;
  loadUnits: number;
  dockId: string | null;
  forced: boolean;
  walkIn: boolean;
  punctuality: Punctuality | null;
  /** MD-03: some 5-minute bucket the booking occupies holds more load than capacity. */
  overCapacity: boolean;
  version: number;
}

export interface BookingPage {
  items: BookingSummary[];
  nextCursor: string | null;
}

export interface BoardSlot {
  startsAt: string;
  wallTime: LocalTime;
  fold: WallTimeFold | null;
  /** Lowest capacity over the slot's buckets; 0 when closed. */
  capacity: number;
  /** Highest load over the slot's buckets. */
  booked: number;
}

export interface BoardResource {
  id: string;
  name: string;
  kind: 'pool' | 'single';
  dailyCap: number | null;
  slots: BoardSlot[];
  bookings: BookingSummary[];
}

/** BK-01: one site-local day, a column per bookable resource. */
export interface BoardView {
  siteId: string;
  date: LocalDate;
  timeZone: TimeZone;
  gridMinutes: number;
  resources: BoardResource[];
}

// An alias of its own, so the API description keeps its `InstructionSafety` component: the
// converter names a type alias, and a value set's name also declares its object.
export type InstructionSafety = Extract<InstructionSafetySet, string>;

export interface BookingSafety {
  status: SafetyStatus;
  /** Whether check-in refuses a missing acknowledgement (`safety.gate_enforcement`). */
  enforced: boolean;
  instructions: {
    instructionId: string;
    name: string;
    status: InstructionSafety;
    acknowledgementId: string | null;
    expiresAt: string | null;
  }[];
}

/** BK-01, BK-03: a booking with its avis, safety status and driver link state. */
export interface BookingView extends Omit<BookingSummary, 'overCapacity'> {
  site: { id: string; name: string };
  resource: { id: string; name: string };
  loadType: { id: string; name: { de: string; en: string } };
  dock: { id: string; code: string } | null;
  createdParty: 'carrier' | 'staff';
  punctualityMinutes: number | null;
  checkedInAt: string | null;
  calledAt: string | null;
  atDockAt: string | null;
  loadingAt: string | null;
  doneAt: string | null;
  departedAt: string | null;
  cancelledAt: string | null;
  noShowAt: string | null;
  turnedAwayAt: string | null;
  actualLoadUnits: number | null;
  discrepancyNote: string | null;
  cancelReason: string | null;
  cancelledLate: boolean;
  departureReason: string | null;
  turnAwayReason: TurnAwayReason | null;
  /** A walk-in turned away without an avis has only `plateSeen`, no counterparty, no units. */
  avis: AvisView | null;
  safety: BookingSafety;
  driverLink: { active: boolean; expiresAt: string | null };
  createdAt: string;
  updatedAt: string;
}

/** `actor` only for `booking.view_actors` (YD-08, works council rule). */
export interface BookingEventView {
  id: string;
  type: BookingEventType;
  at: string;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus | null;
  data: Omit<BookingEventData, 'type'>;
  actor?: {
    party: ActorParty;
    userId: string | null;
    name: string | null;
    job: string | null;
  };
}

export interface CarrierOption {
  id: string;
  name: string;
}

export interface DriverLinkView {
  url: string;
  expiresAt: string;
}
