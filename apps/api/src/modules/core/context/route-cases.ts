import {
  ForeignOutcome,
  HttpMethod,
  RouteCaseActor,
  RouteCaseGrant,
} from '@rampflow/shared/values';
import { defineRouteCases } from '../../../../test/route-cases.ts';

export const cases = defineRouteCases([
  {
    method: HttpMethod.GET,
    path: '/api/t/:orgId/context',
    as: RouteCaseActor.gate_operator,
    permission: RouteCaseGrant.member,
    entitlement: null,
    params: (w) => ({ orgId: w.A.tenantId }),
    foreign: ForeignOutcome.empty,
    siteScoped: false,
  },
  {
    method: HttpMethod.GET,
    path: '/api/c/:orgId/context',
    as: RouteCaseActor.carrier_user,
    permission: RouteCaseGrant.member,
    entitlement: null,
    params: (w) => ({ orgId: w.A.carrierId }),
    foreign: ForeignOutcome.empty,
    siteScoped: false,
  },
  {
    method: HttpMethod.GET,
    path: '/api/platform/context',
    as: RouteCaseActor.platform_admin,
    permission: RouteCaseGrant.member,
    entitlement: null,
    params: () => ({}),
    foreign: ForeignOutcome.not_found,
    siteScoped: false,
  },
]);
