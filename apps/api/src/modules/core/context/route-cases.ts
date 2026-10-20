import { HttpMethod, Role } from '@rampflow/shared/values';
import { defineRouteCases } from '../../../../test/route-cases.ts';

export const cases = defineRouteCases([
  {
    method: HttpMethod.GET,
    path: '/api/t/:orgId/context',
    as: Role.gate_operator,
    permission: 'member',
    entitlement: null,
    params: (w) => ({ orgId: w.A.tenantId }),
    foreign: 'empty',
    siteScoped: false,
  },
  {
    method: HttpMethod.GET,
    path: '/api/c/:orgId/context',
    as: Role.carrier_user,
    permission: 'member',
    entitlement: null,
    params: (w) => ({ orgId: w.A.carrierId }),
    foreign: 'empty',
    siteScoped: false,
  },
  {
    method: HttpMethod.GET,
    path: '/api/platform/context',
    as: Role.platform_admin,
    permission: 'member',
    entitlement: null,
    params: () => ({}),
    foreign: 'not_found',
    siteScoped: false,
  },
]);
