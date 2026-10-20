import type {
  EraseResult,
  SubjectAcknowledgement,
  SubjectBooking,
  SubjectMatches,
} from '@rampflow/shared/modules/privacy/api';
import type { PrivacyRequestKind } from '@rampflow/shared/modules/privacy/values';
import { and, asc, desc, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import type { BookingId, TenantId, UserId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { avis } from '../../avis/schema.ts';
import { booking } from '../../booking/schema.ts';
import { site } from '../../core/schema.ts';
import { safetyAcknowledgement, safetyInstruction, safetyVersion } from '../../safety/schema.ts';
import {
  acknowledgementRetentionEnd,
  pseudonymizeAcknowledgements,
  pseudonymizeAvis,
} from '../retention/rules.ts';
import { privacyRequestLog } from '../schema.ts';

// TN-06: a driver's data subject request. Matching is exact (whole name case-insensitively,
// normalized phone and plate), and the request log stores counts, never the search terms.

/** The parsed query: identifiers normalized by the shared schema. */
export type Subject = { name?: string; phone?: string; plate?: string };

export interface SubjectContext {
  tx: Tx;
  tenantId: TenantId;
  userId: UserId;
  now: Date;
  /** `privacy.retention.safety_after_expiry_days` of the tenant. */
  safetyAfterExpiryDays: number;
}

/** A search answers this many rows of each kind at most. */
const MAX_MATCHES = 500;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function avisMatch(q: Subject): SQL {
  const any: SQL[] = [];
  if (q.name) any.push(sql`lower(${avis.driverName}) = lower(${q.name})`);
  if (q.phone) any.push(eq(avis.driverPhone, q.phone));
  if (q.plate) {
    any.push(eq(avis.plate, q.plate), eq(avis.trailerPlate, q.plate), eq(avis.plateSeen, q.plate));
  }
  return or(...any) ?? sql`false`;
}

async function matchedBookings(ctx: SubjectContext, q: Subject): Promise<SubjectBooking[]> {
  const rows = await ctx.tx
    .select({ a: avis, b: booking, s: { id: site.id, name: site.name, timeZone: site.timeZone } })
    .from(avis)
    .innerJoin(booking, eq(booking.id, avis.bookingId))
    .innerJoin(site, eq(site.id, booking.siteId))
    .where(and(eq(avis.tenantId, ctx.tenantId), avisMatch(q)))
    .orderBy(desc(booking.startsAt), asc(booking.id))
    .limit(MAX_MATCHES);
  return rows.map(({ a, b, s }) => ({
    id: b.id,
    code: b.code,
    status: b.status,
    startsAt: b.startsAt.toISOString(),
    site: s,
    carrierName: b.carrierName,
    driverName: a.driverName,
    driverPhone: a.driverPhone,
    plate: a.plate,
    trailerPlate: a.trailerPlate,
    plateSeen: a.plateSeen,
    pseudonymizedAt: iso(a.pseudonymizedAt),
  }));
}

/** By the typed name, or linked to one of the matched bookings. */
async function matchedAcknowledgements(
  ctx: SubjectContext,
  q: Subject,
  bookingIds: readonly string[],
): Promise<SubjectAcknowledgement[]> {
  const ack = safetyAcknowledgement;
  const any: SQL[] = [];
  if (q.name) any.push(sql`lower(${ack.driverName}) = lower(${q.name})`);
  if (bookingIds.length > 0) any.push(inArray(ack.bookingId, bookingIds as BookingId[]));
  if (any.length === 0) return [];
  const ended = sql<boolean>`${acknowledgementRetentionEnd(ctx.safetyAfterExpiryDays)} < ${ctx.now}`;
  const rows = await ctx.tx
    .select({
      a: ack,
      instructionName: safetyInstruction.name,
      version: safetyVersion.version,
      bookingCode: booking.code,
      ended,
    })
    .from(ack)
    .innerJoin(safetyInstruction, eq(safetyInstruction.id, ack.instructionId))
    .innerJoin(safetyVersion, eq(safetyVersion.id, ack.versionId))
    .leftJoin(booking, eq(booking.id, ack.bookingId))
    .where(and(eq(ack.tenantId, ctx.tenantId), isNull(ack.pseudonymizedAt), or(...any)))
    .orderBy(desc(ack.completedAt), asc(ack.id))
    .limit(MAX_MATCHES);
  return rows.map(({ a, instructionName, version, bookingCode, ended }) => ({
    id: a.id,
    driverName: a.driverName,
    completedAt: a.completedAt.toISOString(),
    expiresAt: iso(a.expiresAt),
    instruction: { id: a.instructionId, name: instructionName },
    version,
    locale: a.locale,
    bookingCode,
    restrictedAt: iso(a.restrictedAt),
    retentionEnded: ended,
  }));
}

/** Bookings whose avis still holds one of the identifiers, and the driver's acknowledgements. */
export async function findSubject(ctx: SubjectContext, q: Subject): Promise<SubjectMatches> {
  const bookings = await matchedBookings(ctx, q);
  return {
    bookings,
    acknowledgements: await matchedAcknowledgements(
      ctx,
      q,
      bookings.map((b) => b.id),
    ),
  };
}

async function logRequest(ctx: SubjectContext, kind: PrivacyRequestKind, m: SubjectMatches) {
  await ctx.tx.insert(privacyRequestLog).values({
    tenantId: ctx.tenantId,
    kind,
    matchedBookings: m.bookings.length,
    matchedAcknowledgements: m.acknowledgements.length,
    actorUserId: ctx.userId,
  });
}

/** Art. 15: everything stored about the subject, as one JSON document. */
export async function exportSubject(
  ctx: SubjectContext,
  q: Subject,
): Promise<SubjectMatches & { exportedAt: string }> {
  const matches = await findSubject(ctx, q);
  await logRequest(ctx, 'export', matches);
  return { exportedAt: ctx.now.toISOString(), ...matches };
}

/**
 * Art. 17 and 18: pseudonymizes the matched bookings with the retention job's function;
 * acknowledgements still under retention become restricted, the others pseudonymized.
 */
export async function eraseSubject(ctx: SubjectContext, q: Subject): Promise<EraseResult> {
  const matches = await findSubject(ctx, q);
  const pseudonymizedBookings = await pseudonymizeAvis(
    ctx.tx,
    ctx.tenantId,
    matches.bookings.filter((b) => b.pseudonymizedAt === null).map((b) => b.id as BookingId),
    ctx.now,
    ctx.userId,
  );
  const held = matches.acknowledgements.filter((a) => !a.retentionEnded).map((a) => a.id);
  const restricted =
    held.length === 0
      ? []
      : await ctx.tx
          .update(safetyAcknowledgement)
          .set({ restrictedAt: ctx.now })
          .where(
            and(
              eq(safetyAcknowledgement.tenantId, ctx.tenantId),
              inArray(safetyAcknowledgement.id, held as never[]),
              isNull(safetyAcknowledgement.restrictedAt),
            ),
          )
          .returning({ id: safetyAcknowledgement.id });
  const expired = matches.acknowledgements.filter((a) => a.retentionEnded).map((a) => a.id);
  const pseudonymizedAcknowledgements =
    expired.length === 0
      ? 0
      : await pseudonymizeAcknowledgements(
          ctx.tx,
          ctx.tenantId,
          inArray(safetyAcknowledgement.id, expired as never[]),
          ctx.now,
        );
  await logRequest(ctx, 'erase', matches);
  return {
    pseudonymizedBookings,
    restrictedAcknowledgements: restricted.length,
    pseudonymizedAcknowledgements,
  };
}
