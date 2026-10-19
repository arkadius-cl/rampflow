import {
  defineAccountCases,
  defineRouteCases,
  type RouteCase,
} from '../../../../test/route-cases.ts';
import type { World } from '../../../../test/world.ts';
import { logoFor, PNG_1PX } from './fixtures.ts';

const P = '/api/t/:orgId/brand/logo';

// The module gate (`brand.logo` off) is checked by the harness through the module's enabledBy.
const base = {
  as: 'tenant_admin',
  permission: 'brand.manage',
  entitlement: null,
  foreign: 'empty',
  siteScoped: false,
} as const satisfies Partial<RouteCase>;

const org = (w: World) => ({ orgId: w.A.tenantId });

export const cases = defineRouteCases([
  {
    ...base,
    method: 'GET',
    path: P,
    params: org,
    setup: async (w, db) => {
      await logoFor(db, w.A.tenantId, w.A.users.tenant_admin.id);
    },
  },
  {
    ...base,
    method: 'PUT',
    path: P,
    params: org,
    raw: () => ({ type: 'image/png', bytes: PNG_1PX }),
  },
  { ...base, method: 'DELETE', path: P, params: org },
]);

export const accountCases = defineAccountCases([
  {
    method: 'GET',
    path: '/api/public/logos/:tenantId/:sha',
    credential: 'none',
    arrange: async (w, db) => {
      const { sha } = await logoFor(db, w.A.tenantId, w.A.users.tenant_admin.id);
      return { actor: null, params: { tenantId: w.A.tenantId, sha } };
    },
  },
]);
