import { defineRouteCases, type RouteCase } from '../../../../test/route-cases.ts';
import type { World } from '../../../../test/world.ts';
import { inviteeEmail } from '../staff/fixtures.ts';

// Platform admins see every tenant by design (ADR-0002), so the harness runs only the control
// call for these cases; behavior is covered in platform.test.ts.

const tenants = {
  as: 'platform_admin',
  permission: 'core.manage_tenants',
  entitlement: null,
  foreign: 'not_found',
  siteScoped: false,
} as const satisfies Partial<RouteCase>;
const settings = { ...tenants, permission: 'core.manage_platform_settings' } as const;

const none = () => ({});
const tenant = (w: World) => ({ tenantId: w.A.tenantId });

export const cases = defineRouteCases([
  { ...tenants, method: 'GET', path: '/api/platform/tenants', params: none },
  {
    ...tenants,
    method: 'POST',
    path: '/api/platform/tenants',
    params: none,
    body: () => ({ name: 'Route case GmbH', package: 'start', adminEmail: inviteeEmail('admin') }),
  },
  { ...tenants, method: 'GET', path: '/api/platform/tenants/:tenantId', params: tenant },
  {
    ...tenants,
    method: 'PATCH',
    path: '/api/platform/tenants/:tenantId',
    params: tenant,
    body: () => ({ name: 'Renamed tenant' }),
  },
  {
    ...tenants,
    method: 'PUT',
    path: '/api/platform/tenants/:tenantId/overrides/:key',
    params: (w) => ({ ...tenant(w), key: 'safety.quiz' }),
    body: () => ({ value: true, expiresAt: null, note: 'trial' }),
  },
  {
    ...tenants,
    method: 'DELETE',
    path: '/api/platform/tenants/:tenantId/overrides/:key',
    params: (w) => ({ ...tenant(w), key: 'safety.quiz' }),
  },
  {
    ...tenants,
    method: 'POST',
    path: '/api/platform/tenants/:tenantId/invitations',
    params: tenant,
    body: () => ({ email: inviteeEmail('admin') }),
  },
  { ...tenants, method: 'GET', path: '/api/platform/packages', params: none },
  { ...settings, method: 'GET', path: '/api/platform/settings', params: none },
  // The code default, so later test files in this worker database still see the default.
  {
    ...settings,
    method: 'PUT',
    path: '/api/platform/settings/:key',
    params: () => ({ key: 'booking.horizon_days' }),
    body: () => ({ value: 30 }),
  },
  {
    ...settings,
    method: 'DELETE',
    path: '/api/platform/settings/:key',
    params: () => ({ key: 'booking.horizon_days' }),
  },
]);
