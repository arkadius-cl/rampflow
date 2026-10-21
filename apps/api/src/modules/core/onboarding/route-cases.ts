import { ForeignOutcome, HttpMethod, Permission, RouteCaseActor } from '@rampflow/shared/values';
import { defineRouteCases } from '../../../../test/route-cases.ts';

export const cases = defineRouteCases([
  {
    method: HttpMethod.GET,
    path: '/api/t/:orgId/onboarding',
    as: RouteCaseActor.tenant_admin,
    permission: Permission.core.manage_sites,
    entitlement: null,
    params: (w) => ({ orgId: w.A.tenantId }),
    foreign: ForeignOutcome.empty,
    siteScoped: false,
  },
]);
