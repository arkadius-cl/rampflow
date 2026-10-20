import type { CommandInput } from '@rampflow/shared/modules/booking/lifecycle';
import { OnSiteStatus } from '@rampflow/shared/modules/booking/values';
import { Feature, HttpMethod, Permission, Role } from '@rampflow/shared/values';
import type { OwnerDb } from '../../../test/db.ts';
import { defineRouteCases, type RouteCase } from '../../../test/route-cases.ts';
import type { World, WorldSide } from '../../../test/world.ts';
import { asStaff, avisInput, bookableSite } from '../booking/lifecycle/fixtures.ts';
import { transitionBooking } from '../booking/lifecycle/transition.ts';
import { briefingOf, seedBriefing } from '../safety/authoring/fixtures.ts';

// Every yard route is site-scoped: operators of the tenant's other site get 404 (TN-01).

const own = (w: World) => ({ orgId: w.A.tenantId, bookingId: w.A.bookings.own.id });
const site = (w: World) => ({ siteId: w.A.sites[0].id });
const org = (w: World) => ({ orgId: w.A.tenantId });

const STEPS = {
  checked_in: ['check_in'],
  called: ['check_in', 'call'],
  loading: ['check_in', 'call', 'start_loading'],
} as const;

/** Moves both worlds' `bookings.own` into `status` through the lifecycle, onto dock 0 of site 0. */
const ownIn = (status: keyof typeof STEPS) => async (w: World) => {
  for (const side of [w.A, w.B] as WorldSide[]) {
    await asStaff(side, side.users.tenant_admin, new Date(), async (ctx) => {
      for (const type of STEPS[status]) {
        const dockId = side.sites[0].dockIds[0];
        const command: CommandInput =
          type === 'check_in' ? { type, plateSeen: null } : { type, dockId };
        await transitionBooking(ctx, side.bookings.own.id, command);
      }
    });
  }
};

const briefings = async (w: World, db: OwnerDb) => {
  await seedBriefing(db, w.A);
  await seedBriefing(db, w.B);
};

const gate = {
  as: Role.gate_operator,
  permission: Permission.yard.gate,
  entitlement: null,
  foreign: 'not_found',
  siteScoped: true,
} as const satisfies Partial<RouteCase>;

const call = {
  as: Role.dock_operator,
  permission: Permission.yard.call,
  entitlement: Feature.yard.call_to_dock,
  foreign: 'not_found',
  siteScoped: true,
} as const satisfies Partial<RouteCase>;

const dock = { ...call, permission: Permission.yard.dock } as const satisfies Partial<RouteCase>;

export const cases = defineRouteCases([
  {
    ...gate,
    method: HttpMethod.GET,
    path: '/api/t/:orgId/yard/expected',
    params: org,
    query: site,
  },
  {
    ...gate,
    method: HttpMethod.POST,
    path: '/api/t/:orgId/yard/search',
    params: org,
    body: (w) => ({ siteId: w.A.sites[0].id, q: w.A.bookings.own.code }),
  },
  { ...gate, method: HttpMethod.GET, path: '/api/t/:orgId/yard/on-site', params: org, query: site },
  {
    ...gate,
    method: HttpMethod.POST,
    path: '/api/t/:orgId/yard/bookings/:bookingId/check-in',
    params: own,
    body: () => ({ plateSeen: 'HH-AB 123' }),
  },
  {
    ...gate,
    method: HttpMethod.POST,
    path: '/api/t/:orgId/yard/bookings/:bookingId/turn-away',
    params: own,
    body: () => ({ reason: 'documents_missing' }),
  },
  {
    ...gate,
    method: HttpMethod.POST,
    path: '/api/t/:orgId/yard/bookings/:bookingId/depart',
    params: own,
    body: () => ({ reason: 'Driver left' }),
    setup: ownIn(OnSiteStatus.checked_in),
  },
  {
    ...gate,
    method: HttpMethod.POST,
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
    entitlement: Feature.safety.briefings,
    method: HttpMethod.POST,
    path: '/api/t/:orgId/yard/bookings/:bookingId/acknowledgement-candidates',
    params: own,
    body: () => ({ name: 'Driver' }),
    setup: briefings,
  },
  {
    ...gate,
    entitlement: Feature.safety.briefings,
    method: HttpMethod.POST,
    path: '/api/t/:orgId/yard/bookings/:bookingId/acknowledgements',
    params: own,
    body: (w) => ({ acknowledgementId: briefingOf(w.A).acknowledgementId }),
    setup: briefings,
  },
  {
    ...gate,
    entitlement: Feature.safety.briefings,
    method: HttpMethod.POST,
    path: '/api/t/:orgId/yard/bookings/:bookingId/briefing-session',
    params: own,
  },
  { ...call, method: HttpMethod.GET, path: '/api/t/:orgId/yard/docks', params: org, query: site },
  {
    ...call,
    method: HttpMethod.POST,
    path: '/api/t/:orgId/yard/bookings/:bookingId/call',
    params: own,
    body: (w) => ({ dockId: w.A.sites[0].dockIds[1] }),
    setup: ownIn(OnSiteStatus.checked_in),
  },
  {
    ...call,
    method: HttpMethod.POST,
    path: '/api/t/:orgId/yard/bookings/:bookingId/uncall',
    params: own,
    setup: ownIn(OnSiteStatus.called),
  },
  {
    ...dock,
    method: HttpMethod.POST,
    path: '/api/t/:orgId/yard/bookings/:bookingId/dock',
    params: own,
    body: () => ({}),
    setup: ownIn(OnSiteStatus.called),
  },
  {
    ...dock,
    method: HttpMethod.POST,
    path: '/api/t/:orgId/yard/bookings/:bookingId/loading',
    params: own,
    body: () => ({}),
    setup: ownIn(OnSiteStatus.called),
  },
  {
    ...dock,
    method: HttpMethod.POST,
    path: '/api/t/:orgId/yard/bookings/:bookingId/complete',
    params: own,
    body: () => ({ actualLoadUnits: 9, discrepancyNote: 'One pallet damaged' }),
    setup: ownIn(OnSiteStatus.loading),
  },
]);
