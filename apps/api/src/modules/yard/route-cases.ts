import type { BookingStatus } from '@rampflow/shared/modules/booking/lifecycle';
import { eq } from 'drizzle-orm';
import type { OwnerDb } from '../../../test/db.ts';
import { defineRouteCases, type RouteCase } from '../../../test/route-cases.ts';
import type { World, WorldSide } from '../../../test/world.ts';
import { avisInput, bookableSite } from '../booking/lifecycle/fixtures.ts';
import { booking } from '../booking/schema.ts';
import { briefingOf, seedBriefing } from '../safety/authoring/fixtures.ts';

// Every yard route is site-scoped: operators of the tenant's other site get 404 (TN-01).

const own = (w: World) => ({ orgId: w.A.tenantId, bookingId: w.A.bookings.own.id });
const site = (w: World) => ({ siteId: w.A.sites[0].id });
const org = (w: World) => ({ orgId: w.A.tenantId });

/** Puts both worlds' `bookings.own` into `status`, on dock 0 of site 0 when it holds a dock. */
const ownIn = (status: BookingStatus) => async (w: World, db: OwnerDb) => {
  const at = new Date();
  for (const side of [w.A, w.B] as WorldSide[]) {
    const holds = status === 'called' || status === 'at_dock' || status === 'loading';
    await db
      .update(booking)
      .set({
        status,
        checkedInAt: at,
        calledAt: holds ? at : null,
        dockId: holds ? side.sites[0].dockIds[0] : null,
      })
      .where(eq(booking.id, side.bookings.own.id));
  }
};

const briefings = async (w: World, db: OwnerDb) => {
  await seedBriefing(db, w.A);
  await seedBriefing(db, w.B);
};

const gate = {
  as: 'gate_operator',
  permission: 'yard.gate',
  entitlement: null,
  foreign: 'not_found',
  siteScoped: true,
} as const satisfies Partial<RouteCase>;

const call = {
  as: 'dock_operator',
  permission: 'yard.call',
  entitlement: 'yard.call_to_dock',
  foreign: 'not_found',
  siteScoped: true,
} as const satisfies Partial<RouteCase>;

const dock = { ...call, permission: 'yard.dock' } as const satisfies Partial<RouteCase>;

export const cases = defineRouteCases([
  { ...gate, method: 'GET', path: '/api/t/:orgId/yard/expected', params: org, query: site },
  {
    ...gate,
    method: 'POST',
    path: '/api/t/:orgId/yard/search',
    params: org,
    body: (w) => ({ siteId: w.A.sites[0].id, q: w.A.bookings.own.code }),
  },
  { ...gate, method: 'GET', path: '/api/t/:orgId/yard/on-site', params: org, query: site },
  {
    ...gate,
    method: 'POST',
    path: '/api/t/:orgId/yard/bookings/:bookingId/check-in',
    params: own,
    body: () => ({ plateSeen: 'HH-AB 123' }),
  },
  {
    ...gate,
    method: 'POST',
    path: '/api/t/:orgId/yard/bookings/:bookingId/turn-away',
    params: own,
    body: () => ({ reason: 'documents_missing' }),
  },
  {
    ...gate,
    method: 'POST',
    path: '/api/t/:orgId/yard/bookings/:bookingId/depart',
    params: own,
    body: () => ({ reason: 'Driver left' }),
    setup: ownIn('checked_in'),
  },
  {
    ...gate,
    method: 'POST',
    path: '/api/t/:orgId/yard/walk-ins',
    params: org,
    body: (w) => ({
      clientRequestId: '0193f6f0-0000-7000-8000-000000000009',
      siteId: w.A.sites[0].id,
      loadTypeId: w.A.sites[0].loadTypeId,
      carrier: { id: w.A.carrierId },
      plateSeen: 'HH-WI 42',
      outcome: 'check_in',
      avis: avisInput(),
    }),
    setup: async (w, db) => {
      await bookableSite(w.A, db);
      await bookableSite(w.B, db);
    },
  },
  {
    ...gate,
    entitlement: 'safety.briefings',
    method: 'POST',
    path: '/api/t/:orgId/yard/bookings/:bookingId/acknowledgement-candidates',
    params: own,
    body: () => ({ name: 'Driver' }),
    setup: briefings,
  },
  {
    ...gate,
    entitlement: 'safety.briefings',
    method: 'POST',
    path: '/api/t/:orgId/yard/bookings/:bookingId/acknowledgements',
    params: own,
    body: (w) => ({ acknowledgementId: briefingOf(w.A).acknowledgementId }),
    setup: briefings,
  },
  {
    ...gate,
    entitlement: 'safety.briefings',
    method: 'POST',
    path: '/api/t/:orgId/yard/bookings/:bookingId/briefing-session',
    params: own,
  },
  { ...call, method: 'GET', path: '/api/t/:orgId/yard/docks', params: org, query: site },
  {
    ...call,
    method: 'POST',
    path: '/api/t/:orgId/yard/bookings/:bookingId/call',
    params: own,
    body: (w) => ({ dockId: w.A.sites[0].dockIds[1] }),
    setup: ownIn('checked_in'),
  },
  {
    ...call,
    method: 'POST',
    path: '/api/t/:orgId/yard/bookings/:bookingId/uncall',
    params: own,
    setup: ownIn('called'),
  },
  {
    ...dock,
    method: 'POST',
    path: '/api/t/:orgId/yard/bookings/:bookingId/dock',
    params: own,
    body: () => ({}),
    setup: ownIn('called'),
  },
  {
    ...dock,
    method: 'POST',
    path: '/api/t/:orgId/yard/bookings/:bookingId/loading',
    params: own,
    body: () => ({}),
    setup: ownIn('called'),
  },
  {
    ...dock,
    method: 'POST',
    path: '/api/t/:orgId/yard/bookings/:bookingId/complete',
    params: own,
    body: () => ({ actualLoadUnits: 9, discrepancyNote: 'One pallet damaged' }),
    setup: ownIn('loading'),
  },
]);
