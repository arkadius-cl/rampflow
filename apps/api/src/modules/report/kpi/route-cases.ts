import {
  Feature,
  ForeignOutcome,
  HttpMethod,
  Permission,
  RouteCaseActor,
} from '@rampflow/shared/values';
import { defineRouteCases, type RouteCase } from '../../../../test/route-cases.ts';

const base = {
  method: HttpMethod.GET,
  as: RouteCaseActor.dispatcher,
  permission: Permission.report.view,
  entitlement: null,
  params: (w) => ({ orgId: w.A.tenantId }),
  // World A's site is unknown to tenant B.
  query: (w) => ({ siteId: w.A.sites[0].id, from: '2026-11-01', to: '2026-11-30' }),
  foreign: ForeignOutcome.not_found,
  // Only dispatchers and tenant admins hold report.view, and they see every site.
  siteScoped: false,
} as const satisfies Partial<RouteCase>;

export const cases = defineRouteCases([
  { ...base, path: '/api/t/:orgId/reports/kpis' },
  { ...base, path: '/api/t/:orgId/reports/kpis.csv', entitlement: Feature.report.export },
  { ...base, path: '/api/t/:orgId/reports/visits' },
  { ...base, path: '/api/t/:orgId/reports/visits.csv', entitlement: Feature.report.export },
]);
