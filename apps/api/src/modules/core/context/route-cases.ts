import { defineRouteCases } from '../../../../test/route-cases.ts';

export const cases = defineRouteCases([
  {
    method: 'GET',
    path: '/api/t/:orgId/context',
    as: 'gate_operator',
    permission: 'member',
    entitlement: null,
    params: (w) => ({ orgId: w.A.tenantId }),
    foreign: 'empty',
    siteScoped: false,
  },
  {
    method: 'GET',
    path: '/api/c/:orgId/context',
    as: 'carrier_user',
    permission: 'member',
    entitlement: null,
    params: (w) => ({ orgId: w.A.carrierId }),
    foreign: 'empty',
    siteScoped: false,
  },
  {
    method: 'GET',
    path: '/api/platform/context',
    as: 'platform_admin',
    permission: 'member',
    entitlement: null,
    params: () => ({}),
    foreign: 'not_found',
    siteScoped: false,
  },
]);
