import { catalog, resolveSetting } from '@rampflow/shared';
import type { AvisInput } from '@rampflow/shared/modules/avis/avis';
import type {
  PortalBookingListQuery,
  PortalBookingPage,
  PortalBookingSummary,
  PortalBookingView,
  PortalRebook,
} from '@rampflow/shared/modules/booking/api.portal';
import type { BookingEventView } from '@rampflow/shared/modules/booking/api.staff';
import {
  BookingPeriod,
  CarrierLinkStatus,
  FinalBookingStatus,
  OnSiteStatus,
} from '@rampflow/shared/modules/booking/values';
import type { TimeZone } from '@rampflow/shared/time';
import { ErrorCode, Setting, SortOrder, values } from '@rampflow/shared/values';
import { and, asc, desc, eq, inArray, not, type SQL, sql } from 'drizzle-orm';
import type * as z from 'zod';
import type { BookingId, CarrierId, SiteId, TenantId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import type { Access } from '../../../kernel/access.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { readAvis } from '../../avis/avis.ts';
import { avis, avisReference } from '../../avis/schema.ts';
import { dock, org, settingValue, site, tenantCarrierLink } from '../../core/schema.ts';
import { activeDriverLink } from '../../driver/access.ts';
import { cutoffAt } from '../lifecycle/guards.ts';
import { bookingSafety } from '../lifecycle/safety.ts';
import { decodeCursor, encodeCursor } from '../lifecycle/view.ts';
import { loadType } from '../schema.resources.ts';
import { booking, bookingEvent } from '../schema.ts';

// Carrier reads across tenants (CR-05, CR-06, BK-06), under the `carrier` party: RLS shows the
// carrier its own bookings at every tenant, and every query filters by carrier_id as well.

const iso = (d: Date | null) => d?.toISOString() ?? null;

type ListQuery = z.output<typeof PortalBookingListQuery>;

/**
 * `booking.cancel_cutoff_minutes` per site of the given tenants, resolved site, tenant, platform
 * from the rows the carrier may read (its linked tenants and the platform's).
 */
async function cutoffMinutes(tx: Tx): Promise<(tenantId: TenantId, siteId: SiteId) => number> {
  const key = 'booking.cancel_cutoff_minutes';
  const rows = await tx.select().from(settingValue).where(eq(settingValue.key, key));
  const value = (match: (r: (typeof rows)[number]) => boolean) => rows.find(match)?.value.v;
  return (tenantId, siteId) =>
    resolveSetting(catalog, key, {
      platform: value((r) => r.tenantId === null),
      tenant: value((r) => r.tenantId === tenantId && r.siteId === null),
      site: value((r) => r.siteId === siteId),
    }).value;
}

const firstReference = sql<string | null>`(
  select ${avisReference.value} from ${avisReference}
  where ${avisReference.bookingId} = ${booking.id}
  order by ${avisReference.createdAt}, ${avisReference.id} limit 1)`;

const summaryColumns = {
  b: booking,
  tenantName: org.name,
  siteName: site.name,
  loadTypeName: loadType.name,
  plate: avis.plate,
  reference: firstReference,
};

type SummaryRow = {
  b: typeof booking.$inferSelect;
  tenantName: string;
  siteName: string;
  loadTypeName: unknown;
  plate: string | null;
  reference: string | null;
};

function summaryOf(row: SummaryRow, cutoff: number): PortalBookingSummary {
  const { b } = row;
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    tenant: { id: b.tenantId, name: row.tenantName },
    site: { id: b.siteId, name: row.siteName },
    timeZone: b.siteTimeZone as TimeZone,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    loadType: { id: b.loadTypeId, name: row.loadTypeName as { de: string; en: string } },
    direction: b.direction,
    loadUnits: b.loadUnits,
    plate: row.plate,
    reference: row.reference,
    checkedInAt: iso(b.checkedInAt),
    departedAt: iso(b.departedAt),
    cutoffAt: cutoffAt(b.startsAt, cutoff).toISOString(),
    version: b.version,
  };
}

function summaryQuery(tx: Tx) {
  return tx
    .select(summaryColumns)
    .from(booking)
    .innerJoin(org, eq(org.id, booking.tenantId))
    .innerJoin(site, eq(site.id, booking.siteId))
    .innerJoin(loadType, eq(loadType.id, booking.loadTypeId))
    .leftJoin(avis, eq(avis.bookingId, booking.id));
}

const localDay = sql`(${booking.startsAt} at time zone ${booking.siteTimeZone})::date`;

/** CR-05 `when=upcoming`: on site, or not final and starting today or later in site time. */
const upcoming = (now: Date): SQL =>
  sql`(${inArray(booking.status, values(OnSiteStatus))} or (${not(inArray(booking.status, values(FinalBookingStatus)))} and ${localDay} >= (${now}::timestamptz at time zone ${booking.siteTimeZone})::date))`;

/** CR-05: the carrier's bookings at every tenant, by start, with the filters of the list. */
export async function listPortalBookings(
  tx: Tx,
  carrierId: CarrierId,
  q: ListQuery,
  now: Date,
): Promise<PortalBookingPage> {
  const after = q.cursor ? decodeCursor(q.cursor) : null;
  const ascending = q.order === SortOrder.asc;
  const rows = await summaryQuery(tx)
    .where(
      and(
        eq(booking.carrierId, carrierId),
        q.tenantId ? eq(booking.tenantId, q.tenantId as TenantId) : undefined,
        q.siteId ? eq(booking.siteId, q.siteId as SiteId) : undefined,
        q.status ? eq(booking.status, q.status) : undefined,
        q.when === BookingPeriod.upcoming
          ? upcoming(now)
          : q.when === BookingPeriod.past
            ? not(upcoming(now))
            : undefined,
        q.from ? sql`${localDay} >= ${q.from}::date` : undefined,
        q.to ? sql`${localDay} <= ${q.to}::date` : undefined,
        after
          ? ascending
            ? sql`(${booking.startsAt}, ${booking.id}) > (${after.at}, ${after.id})`
            : sql`(${booking.startsAt}, ${booking.id}) < (${after.at}, ${after.id})`
          : undefined,
      ),
    )
    .orderBy(
      ...(ascending
        ? [asc(booking.startsAt), asc(booking.id)]
        : [desc(booking.startsAt), desc(booking.id)]),
    )
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  const cutoff = await cutoffMinutes(tx);
  const last = page.at(-1);
  return {
    items: page.map((r) => summaryOf(r, cutoff(r.b.tenantId, r.b.siteId))),
    nextCursor: rows.length > q.limit && last ? encodeCursor(last.b.startsAt, last.b.id) : null,
  };
}

/** The carrier's own booking, or 404 for another carrier's, a foreign or a malformed id. */
async function ownBooking(tx: Tx, carrierId: CarrierId, bookingId: BookingId) {
  const [row] = await summaryQuery(tx)
    .where(and(eq(booking.id, bookingId), eq(booking.carrierId, carrierId)))
    .limit(1);
  if (!row) throw new ApiError(ErrorCode.not_found);
  return row;
}

/**
 * CR-05, BK-05: the booking with the site's address and phone, the visit timeline and its
 * events without actors. `access` is the carrier's access at the booking's tenant, for the
 * safety status.
 */
export async function loadPortalBooking(
  tx: Tx,
  carrierId: CarrierId,
  bookingId: BookingId,
  atTenant: (tenantId: TenantId) => Promise<Access>,
  now: Date,
): Promise<PortalBookingView> {
  const row = await ownBooking(tx, carrierId, bookingId);
  const { b } = row;
  const [place] = await tx
    .select({ s: site, linkStatus: tenantCarrierLink.status })
    .from(site)
    .leftJoin(
      tenantCarrierLink,
      and(eq(tenantCarrierLink.tenantId, b.tenantId), eq(tenantCarrierLink.carrierId, carrierId)),
    )
    .where(eq(site.id, b.siteId));
  if (!place) throw new Error(`site ${b.siteId} of booking ${b.id} invisible to its carrier`);
  const [docked] = b.dockId
    ? await tx.select({ code: dock.code }).from(dock).where(eq(dock.id, b.dockId))
    : [];
  const access = await atTenant(b.tenantId);
  const cutoff = (await access.setting(Setting.booking.cancel_cutoff_minutes, b.siteId)).value;
  const events = await tx
    .select()
    .from(bookingEvent)
    .where(and(eq(bookingEvent.bookingId, b.id), eq(bookingEvent.carrierId, carrierId)))
    .orderBy(asc(bookingEvent.at), asc(bookingEvent.id));
  const link = await activeDriverLink(tx, b.id);
  const { s } = place;
  return {
    ...summaryOf(row, cutoff),
    site: {
      id: s.id,
      name: s.name,
      address: {
        line1: s.addressLine1,
        line2: s.addressLine2,
        postalCode: s.postalCode,
        city: s.city,
        country: s.country,
      },
      phone: s.phone,
    },
    linkActive: place.linkStatus === CarrierLinkStatus.active,
    dockCode: docked?.code ?? null,
    calledAt: iso(b.calledAt),
    atDockAt: iso(b.atDockAt),
    loadingAt: iso(b.loadingAt),
    doneAt: iso(b.doneAt),
    cancelledAt: iso(b.cancelledAt),
    cancelReason: b.cancelReason,
    noShowAt: iso(b.noShowAt),
    turnedAwayAt: iso(b.turnedAwayAt),
    avis: await readAvis(tx, b.id),
    safety: (await bookingSafety(tx, access, b, now)).status,
    driverLink: { active: link !== null, expiresAt: iso(link?.expiresAt ?? null) },
    events: events.map((e) => ({
      id: e.id,
      type: e.type as BookingEventView['type'],
      at: e.at.toISOString(),
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      data: e.data as BookingEventView['data'],
    })),
  };
}

/** BK-06: site, load type and avis of an earlier booking, without references and driver. */
export async function rebookOf(
  tx: Tx,
  carrierId: CarrierId,
  bookingId: BookingId,
): Promise<PortalRebook> {
  const { b } = await ownBooking(tx, carrierId, bookingId);
  const old = await readAvis(tx, b.id);
  const prefill: AvisInput = old
    ? {
        references: [],
        counterpartyName: old.counterpartyName,
        loadUnits: old.loadUnits,
        palletPositions: old.palletPositions,
        grossWeightKg: old.grossWeightKg,
        palletExchange: old.palletExchange,
        vehicle: old.vehicle,
        dangerousGoods: old.dangerousGoods,
        temperature: old.temperature,
        notes: old.notes,
      }
    : { references: [], counterpartyName: '', loadUnits: [] };
  return { tenantId: b.tenantId, siteId: b.siteId, loadTypeId: b.loadTypeId, avis: prefill };
}

/** 404 unless the booking is the carrier's own. */
export async function requireOwnBooking(
  tx: Tx,
  carrierId: CarrierId,
  bookingId: BookingId,
): Promise<void> {
  await ownBooking(tx, carrierId, bookingId);
}
