import { HttpMethod, Permission, Role } from '@rampflow/shared/values';
import { defineRouteCases, type RouteCase } from '../../../../test/route-cases.ts';

const base = {
  method: HttpMethod.POST,
  as: Role.tenant_admin,
  permission: Permission.privacy.manage_requests,
  // The privacy module has no entitlement: GDPR duties hold in every package.
  entitlement: null,
  params: (w) => ({ orgId: w.A.tenantId }),
  // World B's admin searching for A's driver finds nothing of A.
  foreign: 'empty',
  // Only tenant admins hold privacy.manage_requests, and they see every site.
  siteScoped: false,
} as const satisfies Partial<RouteCase>;

const driverOf = (w: Parameters<NonNullable<RouteCase['body']>>[0]) =>
  `Driver ${w.A.bookings.own.code}`;

export const cases = defineRouteCases([
  { ...base, path: '/api/t/:orgId/privacy/search', body: (w) => ({ name: driverOf(w) }) },
  { ...base, path: '/api/t/:orgId/privacy/export', body: (w) => ({ name: driverOf(w) }) },
  {
    ...base,
    path: '/api/t/:orgId/privacy/erase',
    body: (w) => ({ name: driverOf(w), confirm: true }),
  },
]);
