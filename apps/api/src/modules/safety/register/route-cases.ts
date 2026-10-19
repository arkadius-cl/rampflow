import { defineRouteCases, type RouteCase } from '../../../../test/route-cases.ts';
import { seedBriefing } from '../authoring/fixtures.ts';

const base = {
  as: 'dispatcher',
  permission: 'safety.view_register',
  entitlement: null,
  // B's own register lists only B's acknowledgements, none of A's ids or booking codes.
  foreign: 'empty',
  siteScoped: false,
  params: (w) => ({ orgId: w.A.tenantId }),
  body: () => ({}),
  setup: async (w, o) => {
    await seedBriefing(o, w.A);
    await seedBriefing(o, w.B);
  },
} as const satisfies Partial<RouteCase>;

export const cases = defineRouteCases([
  {
    ...base,
    method: 'GET',
    path: '/api/t/:orgId/safety/acknowledgements/filters',
    body: undefined,
  },
  { ...base, method: 'POST', path: '/api/t/:orgId/safety/acknowledgements/search' },
  { ...base, method: 'POST', path: '/api/t/:orgId/safety/acknowledgements.csv' },
]);
