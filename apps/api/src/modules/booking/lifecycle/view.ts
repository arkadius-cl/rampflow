import type {
  BookingEventView,
  BookingSummary,
  BookingView,
} from '@rampflow/shared/modules/booking/api.staff';
import type { TimeZone } from '@rampflow/shared/time';
import { and, asc, eq, sql } from 'drizzle-orm';
import * as z from 'zod';
import type { BookingId, TenantId, UserId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import type { Access } from '../../../kernel/access.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { userDisplay } from '../../../kernel/users.ts';
import { readAvis } from '../../avis/avis.ts';
import { dock, site } from '../../core/schema.ts';
import { activeDriverLink } from '../../driver/access.ts';
import { bookableResource, loadType } from '../schema.resources.ts';
import { booking, bookingEvent } from '../schema.ts';
import type { BookingRow } from './notify.ts';
import { bookingSafety } from './safety.ts';

// Read models of one booking (BK-01, BK-03, YD-08). Every read runs under the caller's scope,
// so a booking outside it is a 404.

const iso = (d: Date | null) => d?.toISOString() ?? null;

export function bookingSummary(b: BookingRow, overCapacity: boolean): BookingSummary {
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    siteId: b.siteId,
    resourceId: b.resourceId,
    loadTypeId: b.loadTypeId,
    carrierId: b.carrierId,
    carrierName: b.carrierName,
    direction: b.direction,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    blocksUntil: b.blocksUntil.toISOString(),
    timeZone: b.siteTimeZone as TimeZone,
    loadUnits: b.loadUnits,
    dockId: b.dockId,
    forced: b.forced,
    walkIn: b.walkIn,
    punctuality: b.punctuality,
    overCapacity,
    version: b.version,
  };
}

export async function loadBookingView(
  tx: Tx,
  access: Access,
  tenantId: TenantId,
  bookingId: BookingId,
  now: Date,
): Promise<BookingView> {
  const [row] = await tx
    .select({
      b: booking,
      siteName: site.name,
      resourceName: bookableResource.name,
      loadTypeName: loadType.name,
      dockCode: dock.code,
    })
    .from(booking)
    .innerJoin(site, eq(site.id, booking.siteId))
    .innerJoin(bookableResource, eq(bookableResource.id, booking.resourceId))
    .innerJoin(loadType, eq(loadType.id, booking.loadTypeId))
    .leftJoin(dock, eq(dock.id, booking.dockId))
    .where(and(eq(booking.id, bookingId), eq(booking.tenantId, tenantId)));
  if (!row) throw new ApiError('not_found');
  const { b } = row;
  const { overCapacity: _, ...summary } = bookingSummary(b, false);
  const link = await activeDriverLink(tx, b.id);
  return {
    ...summary,
    site: { id: b.siteId, name: row.siteName },
    resource: { id: b.resourceId, name: row.resourceName },
    loadType: { id: b.loadTypeId, name: row.loadTypeName as BookingView['loadType']['name'] },
    dock: b.dockId && row.dockCode ? { id: b.dockId, code: row.dockCode } : null,
    createdParty: b.createdParty,
    punctualityMinutes: b.punctualityMinutes,
    checkedInAt: iso(b.checkedInAt),
    calledAt: iso(b.calledAt),
    atDockAt: iso(b.atDockAt),
    loadingAt: iso(b.loadingAt),
    doneAt: iso(b.doneAt),
    departedAt: iso(b.departedAt),
    cancelledAt: iso(b.cancelledAt),
    noShowAt: iso(b.noShowAt),
    turnedAwayAt: iso(b.turnedAwayAt),
    actualLoadUnits: b.actualLoadUnits,
    discrepancyNote: b.discrepancyNote,
    cancelReason: b.cancelReason,
    cancelledLate: b.cancelledLate,
    departureReason: b.departureReason,
    turnAwayReason: b.turnAwayReason,
    avis: await readAvis(tx, b.id),
    safety: await bookingSafety(tx, access, b, now),
    driverLink: { active: link !== null, expiresAt: iso(link?.expiresAt ?? null) },
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

const Cursor = z.object({ t: z.iso.datetime(), id: z.uuid() });

export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(JSON.stringify({ t: at.toISOString(), id })).toString('base64url');
}

export function decodeCursor(cursor: string): { at: Date; id: string } {
  try {
    const c = Cursor.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
    return { at: new Date(c.t), id: c.id };
  } catch {
    throw new ApiError('validation_failed', 'Invalid cursor', {
      issues: [{ path: ['cursor'], code: 'custom', message: 'Invalid cursor' }],
    });
  }
}

/** 404 unless the caller's scope sees the booking. */
export async function requireBooking(tx: Tx, tenantId: TenantId, bookingId: BookingId) {
  const [visible] = await tx
    .select({ id: booking.id })
    .from(booking)
    .where(and(eq(booking.id, bookingId), eq(booking.tenantId, tenantId)));
  if (!visible) throw new ApiError('not_found');
}

/**
 * YD-08: the event log of a booking, oldest first. Actor identities only with
 * `booking.view_actors` (tenant admins, works council rule).
 */
export async function loadBookingEvents(
  tx: Tx,
  access: Access,
  where: { tenantId: TenantId; bookingId: BookingId },
  page: { limit: number; cursor?: string },
): Promise<{ items: BookingEventView[]; nextCursor: string | null }> {
  await requireBooking(tx, where.tenantId, where.bookingId);
  const after = page.cursor ? decodeCursor(page.cursor) : null;
  const rows = await tx
    .select()
    .from(bookingEvent)
    .where(
      and(
        eq(bookingEvent.tenantId, where.tenantId),
        eq(bookingEvent.bookingId, where.bookingId),
        after
          ? sql`(${bookingEvent.at}, ${bookingEvent.id}) > (${after.at}, ${after.id})`
          : undefined,
      ),
    )
    .orderBy(asc(bookingEvent.at), asc(bookingEvent.id))
    .limit(page.limit + 1);
  const more = rows.length > page.limit;
  const items = rows.slice(0, page.limit);
  const withActors = access.permissions.has('booking.view_actors');
  const names = withActors
    ? await userDisplay(
        tx,
        items.flatMap((e) => (e.actorUserId ? [e.actorUserId as UserId] : [])),
      )
    : new Map();
  const last = items.at(-1);
  return {
    items: items.map((e) => ({
      id: e.id,
      type: e.type as BookingEventView['type'],
      at: e.at.toISOString(),
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      data: e.data as BookingEventView['data'],
      ...(withActors
        ? {
            actor: {
              party: e.actorParty,
              userId: e.actorUserId,
              name: e.actorUserId ? (names.get(e.actorUserId)?.name ?? null) : null,
              job: e.actorJob,
            },
          }
        : {}),
    })),
    nextCursor: more && last ? encodeCursor(last.at, last.id) : null,
  };
}
