import { defineRouteCases, type RouteCase } from '../../../../test/route-cases.ts';
import type { World } from '../../../../test/world.ts';

const P = '/api/t/:orgId/settings';

// Settings need core.manage_settings, which operators lack: `siteScoped` checks the 403.
const base = {
  as: 'tenant_admin',
  permission: 'core.manage_settings',
  entitlement: null,
  foreign: 'not_found',
  siteScoped: true,
} as const satisfies Partial<RouteCase>;

const site = (w: World) => ({ siteId: w.A.sites[0].id });

export const cases = defineRouteCases([
  {
    ...base,
    method: 'GET',
    path: P,
    params: (w) => ({ orgId: w.A.tenantId }),
    query: site,
  },
  {
    ...base,
    method: 'PUT',
    path: `${P}/:key`,
    // A setting whose `requires` feature is off answers 403 entitlement_required (TN-02).
    entitlement: 'safety.gate_enforcement',
    params: (w) => ({ orgId: w.A.tenantId, key: 'safety.require_for_checkin' }),
    body: (w) => ({ ...site(w), value: false }),
  },
  {
    ...base,
    method: 'DELETE',
    path: `${P}/:key`,
    params: (w) => ({ orgId: w.A.tenantId, key: 'booking.horizon_days' }),
    query: site,
  },
]);
