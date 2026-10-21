import {
  Feature,
  ForeignOutcome,
  HttpMethod,
  Permission,
  RouteCaseActor,
} from '@rampflow/shared/values';
import { defineRouteCases, type RouteCase } from '../../../../test/route-cases.ts';
import type { World } from '../../../../test/world.ts';

const P = '/api/t/:orgId/settings';

// Settings need core.manage_settings, which operators lack: `siteScoped` checks the 403.
const base = {
  as: RouteCaseActor.tenant_admin,
  permission: Permission.core.manage_settings,
  entitlement: null,
  foreign: ForeignOutcome.not_found,
  siteScoped: true,
} as const satisfies Partial<RouteCase>;

const site = (w: World) => ({ siteId: w.A.sites[0].id });

export const cases = defineRouteCases([
  {
    ...base,
    method: HttpMethod.GET,
    path: P,
    params: (w) => ({ orgId: w.A.tenantId }),
    query: site,
  },
  {
    ...base,
    method: HttpMethod.PATCH,
    path: P,
    // A setting whose `requires` feature is off answers 403 entitlement_required (TN-02).
    entitlement: Feature.safety.gate_enforcement,
    params: (w) => ({ orgId: w.A.tenantId }),
    body: (w) => ({ ...site(w), set: { 'safety.require_for_checkin': false }, reset: [] }),
  },
  {
    ...base,
    method: HttpMethod.PUT,
    path: `${P}/:key`,
    // A setting whose `requires` feature is off answers 403 entitlement_required (TN-02).
    entitlement: Feature.safety.gate_enforcement,
    params: (w) => ({ orgId: w.A.tenantId, key: 'safety.require_for_checkin' }),
    body: (w) => ({ ...site(w), value: false }),
  },
  {
    ...base,
    method: HttpMethod.DELETE,
    path: `${P}/:key`,
    params: (w) => ({ orgId: w.A.tenantId, key: 'booking.horizon_days' }),
    query: site,
  },
]);
