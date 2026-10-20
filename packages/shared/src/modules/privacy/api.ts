import * as z from 'zod';
import { phoneSchema, plateSchema } from '../avis/avis.ts';
import type { BookingStatus } from '../booking/values.ts';

// Request schemas and response shapes of /api/t/:orgId/privacy (TN-06). The identifiers travel
// in POST bodies, never in query strings (API conventions, "Requests").

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const subject = z.object({
  name: z.preprocess(blankToUndefined, z.string().trim().min(2).max(120).optional()),
  phone: z.preprocess(blankToUndefined, phoneSchema.optional()),
  plate: z.preprocess(blankToUndefined, plateSchema.optional()),
});
const hasIdentifier = (q: z.output<typeof subject>) =>
  q.name !== undefined || q.phone !== undefined || q.plate !== undefined;
const identifierIssue = { message: 'Enter a name, phone or plate', path: ['name'] };

/**
 * A data subject by name, phone or plate; a booking or acknowledgement matches when any given
 * identifier does. The name matches whole and case-insensitively, so an erase never reaches a
 * driver who merely shares a part of the name.
 */
export const SubjectQuery = subject.refine(hasIdentifier, identifierIssue);
export type SubjectQuery = z.input<typeof SubjectQuery>;

/** Erase needs the explicit confirmation on top of the query. */
export const EraseRequest = subject
  .extend({ confirm: z.literal(true) })
  .refine(hasIdentifier, identifierIssue);
export type EraseRequest = z.input<typeof EraseRequest>;

export interface SubjectBooking {
  id: string;
  code: string;
  status: BookingStatus;
  startsAt: string;
  site: { id: string; name: string; timeZone: string };
  carrierName: string;
  driverName: string | null;
  driverPhone: string | null;
  plate: string | null;
  trailerPlate: string | null;
  plateSeen: string | null;
  pseudonymizedAt: string | null;
}

export interface SubjectAcknowledgement {
  id: string;
  driverName: string;
  completedAt: string;
  expiresAt: string | null;
  instruction: { id: string; name: string };
  version: number;
  locale: string;
  bookingCode: string | null;
  restrictedAt: string | null;
  /** Past its retention: an erase pseudonymizes it instead of restricting it. */
  retentionEnded: boolean;
}

export interface SubjectMatches {
  bookings: SubjectBooking[];
  acknowledgements: SubjectAcknowledgement[];
}

export interface EraseResult {
  pseudonymizedBookings: number;
  restrictedAcknowledgements: number;
  pseudonymizedAcknowledgements: number;
}
