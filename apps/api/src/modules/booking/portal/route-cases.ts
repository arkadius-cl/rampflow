import { and, eq } from 'drizzle-orm';
import type { OwnerDb } from '../../../../test/db.ts';
import { defineRouteCases, type RouteCase } from '../../../../test/route-cases.ts';
import type { World } from '../../../../test/world.ts';
import { tenantCarrierLink } from '../../core/schema.ts';
import { avisInput, bookableSite } from '../lifecycle/fixtures.ts';

const AT = '/api/c/:orgId/at/:tenantId';

async function bookable(w: World, db: OwnerDb): Promise<void> {
  await bookableSite(w.A, db);
  await bookableSite(w.B, db);
}

// The harness counts the first carrier's site ids as secrets from the rival carrier. A rival
// linked to the same tenant legitimately sees that tenant's sites and books at them, so the
// cases whose answer names a site take the rival off the tenant (tenant reads, create), or list
// only site 1, where the rival has no booking: the rival check then proves it sees nothing of A.
async function withoutRivalLink(w: World, db: OwnerDb): Promise<void> {
  await bookable(w, db);
  await db
    .delete(tenantCarrierLink)
    .where(
      and(
        eq(tenantCarrierLink.tenantId, w.A.tenantId),
        eq(tenantCarrierLink.carrierId, w.A.rivalCarrierId),
      ),
    );
}

const atA = (w: World) => ({ orgId: w.A.carrierId, tenantId: w.A.tenantId });
const own = (w: World) => ({ ...atA(w), bookingId: w.A.bookings.own.id });

/** An offered start: two days ahead on the hour, inside the default lead time and horizon. */
function offeredStart(): string {
  const at = new Date(Date.now() + 2 * 86_400_000);
  at.setUTCMinutes(0, 0, 0);
  return at.toISOString();
}

const carrierCase = {
  as: 'carrier_user',
  permission: 'booking.book',
  entitlement: 'booking.carrier_portal',
  foreign: 'not_found',
  siteScoped: false,
} as const satisfies Partial<RouteCase>;

export const cases = defineRouteCases([
  {
    ...carrierCase,
    method: 'GET',
    path: '/api/c/:orgId/bookings',
    permission: 'booking.view',
    entitlement: null,
    params: (w) => ({ orgId: w.A.carrierId }),
    query: (w) => ({ siteId: w.A.sites[1].id }),
    foreign: 'empty',
  },
  {
    ...carrierCase,
    method: 'GET',
    path: '/api/c/:orgId/bookings/:bookingId',
    permission: 'booking.view',
    entitlement: null,
    params: (w) => ({ orgId: w.A.carrierId, bookingId: w.A.bookings.own.id }),
  },
  {
    ...carrierCase,
    method: 'GET',
    path: '/api/c/:orgId/bookings/:bookingId/driver-link',
    entitlement: null,
    params: (w) => ({ orgId: w.A.carrierId, bookingId: w.A.bookings.own.id }),
  },
  {
    ...carrierCase,
    method: 'GET',
    path: '/api/c/:orgId/bookings/:bookingId/rebook',
    entitlement: null,
    params: (w) => ({ orgId: w.A.carrierId, bookingId: w.A.bookings.own.id }),
  },
  {
    ...carrierCase,
    method: 'GET',
    path: `${AT}/sites`,
    params: atA,
    setup: withoutRivalLink,
    foreign: 'empty',
  },
  {
    ...carrierCase,
    method: 'GET',
    path: `${AT}/load-types`,
    params: atA,
    query: (w) => ({ siteId: w.A.sites[0].id }),
    setup: withoutRivalLink,
  },
  {
    ...carrierCase,
    method: 'GET',
    path: `${AT}/availability`,
    params: atA,
    query: (w) => ({
      siteId: w.A.sites[0].id,
      loadTypeId: w.A.sites[0].loadTypeId,
      date: offeredStart().slice(0, 10),
      loadUnits: '10',
    }),
    setup: withoutRivalLink,
  },
  {
    ...carrierCase,
    method: 'POST',
    path: `${AT}/bookings`,
    params: atA,
    body: (w) => ({
      clientRequestId: '0193f6f0-0000-7000-8000-0000000000c8',
      siteId: w.A.sites[0].id,
      loadTypeId: w.A.sites[0].loadTypeId,
      startsAt: offeredStart(),
      avis: avisInput(),
    }),
    setup: withoutRivalLink,
  },
  {
    ...carrierCase,
    method: 'PATCH',
    path: `${AT}/bookings/:bookingId`,
    params: own,
    body: () => ({ startsAt: '2026-11-02T09:00:00.000Z', version: 1 }),
    setup: bookable,
  },
  {
    ...carrierCase,
    method: 'POST',
    path: `${AT}/bookings/:bookingId/cancel`,
    params: own,
    body: () => ({}),
  },
  {
    ...carrierCase,
    method: 'PUT',
    path: `${AT}/bookings/:bookingId/avis`,
    entitlement: 'avis.basic',
    params: own,
    body: () => ({ avis: avisInput({ counterpartyName: 'Anderer Lieferant' }), version: 1 }),
    setup: bookable,
  },
  {
    ...carrierCase,
    method: 'POST',
    path: `${AT}/bookings/:bookingId/driver-link`,
    entitlement: null,
    params: own,
  },
  {
    ...carrierCase,
    method: 'POST',
    path: `${AT}/bookings/:bookingId/driver-link/email`,
    entitlement: 'notify.email',
    params: own,
    body: () => ({ email: 'driver@example.test', locale: 'pl' }),
  },
]);
