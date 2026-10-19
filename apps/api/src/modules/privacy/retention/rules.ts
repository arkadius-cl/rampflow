import { and, eq, inArray, isNotNull, isNull, lt, type SQL, sql } from 'drizzle-orm';
import type { BookingId, TenantId, UserId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import type { Access } from '../../../kernel/access.ts';
import { avis } from '../../avis/schema.ts';
import { booking, bookingEvent } from '../../booking/schema.ts';
import { driverAccess } from '../../driver/schema.ts';
import { safetyAcknowledgement } from '../../safety/schema.ts';

// The tenant rules of data-model.md, "Retention" (PL-05). Each is one set-based statement on
// rows past their limit and marks what it did, so a second run finds nothing to do. TN-06
// erase calls the same pseudonymization for the bookings it matched.

const DAY_MS = 86_400_000;
const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * DAY_MS);

export interface RetentionLimits {
  driverPhoneDays: number;
  driverIdentityDays: number;
  visitDays: number;
  safetyAfterExpiryDays: number;
  auditLogDays: number;
}

export async function retentionLimits(access: Pick<Access, 'setting'>): Promise<RetentionLimits> {
  const days = async (
    key:
      | 'privacy.retention.driver_phone_days'
      | 'privacy.retention.driver_identity_days'
      | 'privacy.retention.visit_days'
      | 'privacy.retention.safety_after_expiry_days'
      | 'privacy.retention.audit_log_days',
  ) => (await access.setting(key, null)).value;
  return {
    driverPhoneDays: await days('privacy.retention.driver_phone_days'),
    driverIdentityDays: await days('privacy.retention.driver_identity_days'),
    visitDays: await days('privacy.retention.visit_days'),
    safetyAfterExpiryDays: await days('privacy.retention.safety_after_expiry_days'),
    auditLogDays: await days('privacy.retention.audit_log_days'),
  };
}

/** When a booking reached its final state; `null` while it is active. */
const endedAt = sql`case when ${booking.status} in ('departed', 'cancelled', 'no_show', 'turned_away')
  then coalesce(${booking.departedAt}, ${booking.turnedAwayAt}, ${booking.cancelledAt}, ${booking.noShowAt}) end`;

/** Bookings of the tenant that reached a final state before `before`. */
const endedBefore = (tenantId: TenantId, before: Date) =>
  sql`select ${booking.id} from ${booking} where ${booking.tenantId} = ${tenantId} and ${endedAt} < ${before}`;

/**
 * Removes the driver's identity from the avis of the matched bookings: name, phone, plates and
 * the plate seen at the gate. Rows already pseudonymized stay untouched. Returns the count.
 */
export async function pseudonymizeAvis(
  tx: Tx,
  tenantId: TenantId,
  bookings: SQL | readonly BookingId[],
  now: Date,
  by: UserId | null = null,
): Promise<number> {
  if (Array.isArray(bookings) && bookings.length === 0) return 0;
  const rows = await tx
    .update(avis)
    .set({
      driverName: null,
      driverPhone: null,
      plate: null,
      trailerPlate: null,
      plateSeen: null,
      phoneErasedAt: sql`coalesce(${avis.phoneErasedAt}, case when ${avis.driverPhone} is not null then ${now}::timestamptz end)`,
      pseudonymizedAt: now,
      updatedAt: now,
      updatedBy: by,
    })
    .where(
      and(
        eq(avis.tenantId, tenantId),
        isNull(avis.pseudonymizedAt),
        Array.isArray(bookings)
          ? inArray(avis.bookingId, [...(bookings as readonly BookingId[])])
          : sql`${avis.bookingId} in (${bookings})`,
      ),
    )
    .returning({ id: avis.bookingId });
  return rows.length;
}

/** The instant an acknowledgement's retention ends: expiry (or completion) plus the setting. */
export const acknowledgementRetentionEnd = (days: number) =>
  sql<Date>`coalesce(${safetyAcknowledgement.expiresAt}, ${safetyAcknowledgement.completedAt}) + make_interval(days => ${days})`;

/** Replaces the typed driver name; restricted rows follow the same rule. */
export async function pseudonymizeAcknowledgements(
  tx: Tx,
  tenantId: TenantId,
  where: SQL,
  now: Date,
): Promise<number> {
  const rows = await tx
    .update(safetyAcknowledgement)
    .set({ driverName: '', pseudonymizedAt: now })
    .where(
      and(
        eq(safetyAcknowledgement.tenantId, tenantId),
        isNull(safetyAcknowledgement.pseudonymizedAt),
        where,
      ),
    )
    .returning({ id: safetyAcknowledgement.id });
  return rows.length;
}

/** Every tenant rule once, in the job's tenant scope. Counts only, never a value. */
export async function applyTenantRetention(
  tx: Tx,
  tenantId: TenantId,
  limits: RetentionLimits,
  now: Date,
): Promise<Record<string, number>> {
  const phones = await tx
    .update(avis)
    .set({ driverPhone: null, phoneErasedAt: now, updatedAt: now, updatedBy: null })
    .where(
      and(
        eq(avis.tenantId, tenantId),
        isNotNull(avis.driverPhone),
        sql`${avis.bookingId} in (${endedBefore(tenantId, daysBefore(now, limits.driverPhoneDays))})`,
      ),
    )
    .returning({ id: avis.bookingId });

  const identities = await pseudonymizeAvis(
    tx,
    tenantId,
    endedBefore(tenantId, daysBefore(now, limits.driverIdentityDays)),
    now,
  );

  const acknowledgements = await pseudonymizeAcknowledgements(
    tx,
    tenantId,
    sql`${acknowledgementRetentionEnd(limits.safetyAfterExpiryDays)} < ${now}`,
    now,
  );

  const events = await tx
    .delete(bookingEvent)
    .where(
      and(
        eq(bookingEvent.tenantId, tenantId),
        lt(bookingEvent.at, daysBefore(now, limits.auditLogDays)),
      ),
    )
    .returning({ id: bookingEvent.id });

  const links = await tx
    .delete(driverAccess)
    .where(and(eq(driverAccess.tenantId, tenantId), lt(driverAccess.expiresAt, now)))
    .returning({ id: driverAccess.id });

  // By slot start, so a booking that never reached a final state goes too.
  const visits = await tx
    .delete(booking)
    .where(
      and(eq(booking.tenantId, tenantId), lt(booking.startsAt, daysBefore(now, limits.visitDays))),
    )
    .returning({ id: booking.id });

  return {
    phonesErased: phones.length,
    identitiesPseudonymized: identities,
    acknowledgementsPseudonymized: acknowledgements,
    eventsDeleted: events.length,
    driverLinksDeleted: links.length,
    visitsDeleted: visits.length,
  };
}
