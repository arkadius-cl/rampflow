import * as z from 'zod';
import { type LocalDate, localDateSchema, type TimeZone } from '../../time/index.ts';
import { AvisInput, type AvisRules, type AvisView } from '../avis/avis.ts';
import type { OfferedStart } from './api.capacity.ts';
import type { BookingEventView, BookingSafety } from './api.staff.ts';
import { BOOKING_STATUSES, type BookingStatus } from './lifecycle.ts';

// Request schemas and response shapes of the carrier booking portal: /api/c/:orgId/bookings
// (CR-05, CR-06, BK-06) and /api/c/:orgId/at/:tenantId (BK-04, BK-05, AV-01, AV-02, CR-06).

const isoInstant = z.iso.datetime({ offset: true });
const limit = z.coerce.number().pipe(z.int().min(1).max(200)).default(50);

/**
 * CR-05. `from` and `to` are site-local dates of each booking's start, so one filter reads the
 * same at sites in different zones. `order: 'desc'` lists the past newest first.
 *
 * `when` splits the list by lifecycle state. `upcoming`: a truck on site, or a requested or
 * confirmed booking starting today or later in its site's zone. `past`: everything else, so a
 * final booking (departed, cancelled, no-show, turned away) is past even when it is today.
 */
export const PortalBookingListQuery = z.object({
  tenantId: z.uuid().optional(),
  siteId: z.uuid().optional(),
  from: localDateSchema.optional(),
  to: localDateSchema.optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
  when: z.enum(['upcoming', 'past']).optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
  limit,
  cursor: z.string().max(200).optional(),
});
export type PortalBookingListQuery = z.input<typeof PortalBookingListQuery>;

export const PortalLoadTypesQuery = z.object({ siteId: z.uuid() });

export const PortalAvailabilityQuery = z.object({
  siteId: z.uuid(),
  loadTypeId: z.uuid(),
  date: localDateSchema,
  loadUnits: z.coerce.number().pipe(z.int().min(0).max(10_000)).default(0),
});
export type PortalAvailabilityQuery = z.input<typeof PortalAvailabilityQuery>;

export const CreateCarrierBooking = z.object({
  clientRequestId: z.uuid(),
  siteId: z.uuid(),
  loadTypeId: z.uuid(),
  startsAt: isoInstant,
  avis: AvisInput,
});
export type CreateCarrierBooking = z.input<typeof CreateCarrierBooking>;

export const CarrierReschedule = z.object({ startsAt: isoInstant, version: z.int().min(1) });
export type CarrierReschedule = z.input<typeof CarrierReschedule>;

export const CarrierCancel = z.object({ reason: z.string().trim().min(1).max(500).optional() });
export type CarrierCancel = z.input<typeof CarrierCancel>;

export interface PortalAddress {
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  country: string;
}

/** BK-04: a site of a linked tenant with what the wizard needs to explain its rules. */
export interface PortalSite {
  id: string;
  name: string;
  address: PortalAddress;
  phone: string | null;
  timeZone: TimeZone;
  /** `booking.cancel_cutoff_minutes`: change and cancel close this long before the start. */
  cutoffMinutes: number;
  leadMinutes: number;
  horizonDays: number;
  avisRules: AvisRules;
}

export interface PortalLoadType {
  id: string;
  name: { de: string; en: string };
  direction: 'inbound' | 'outbound';
}

/** Offered starts of one site-local day. Resources stay internal: carriers book the site. */
export interface PortalOffers {
  siteId: string;
  date: LocalDate;
  timeZone: TimeZone;
  durationMinutes: number;
  gridMinutes: number;
  starts: OfferedStart[];
}

/** One row of the carrier's booking list across tenants (CR-05). */
export interface PortalBookingSummary {
  id: string;
  code: string;
  status: BookingStatus;
  tenant: { id: string; name: string };
  site: { id: string; name: string };
  timeZone: TimeZone;
  startsAt: string;
  endsAt: string;
  loadType: { id: string; name: { de: string; en: string } };
  direction: 'inbound' | 'outbound';
  loadUnits: number;
  plate: string | null;
  reference: string | null;
  checkedInAt: string | null;
  departedAt: string | null;
  /** `startsAt - booking.cancel_cutoff_minutes`: the last instant the carrier may change it. */
  cutoffAt: string;
  version: number;
}

export interface PortalBookingPage {
  items: PortalBookingSummary[];
  nextCursor: string | null;
}

/** CR-05, BK-05: the booking detail, with the visit timeline and the events without actors. */
export interface PortalBookingView extends PortalBookingSummary {
  site: { id: string; name: string; address: PortalAddress; phone: string | null };
  /** Whether the tenant link is active; a deactivated link may only cancel (TN-03). */
  linkActive: boolean;
  dockCode: string | null;
  calledAt: string | null;
  atDockAt: string | null;
  loadingAt: string | null;
  doneAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  noShowAt: string | null;
  turnedAwayAt: string | null;
  avis: AvisView | null;
  safety: BookingSafety['status'];
  driverLink: { active: boolean; expiresAt: string | null };
  events: Omit<BookingEventView, 'actor'>[];
}

/** BK-06 "Book again": the old booking without references, date and driver. */
export interface PortalRebook {
  tenantId: string;
  siteId: string;
  loadTypeId: string;
  avis: AvisInput;
}

export interface PortalDriverLink {
  url: string;
  expiresAt: string;
}
