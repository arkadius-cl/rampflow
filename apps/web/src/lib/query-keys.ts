import { OrgKind } from '@rampflow/shared/values';

// Query keys start with the area and the org id (ADR-0011), so switching org never shows another
// org's cached data, and `invalidateQueries({ queryKey: [area, orgId] })` refreshes one org.
//   ['me']                              the signed-in user and memberships
//   ['tenant', orgId, 'context']        GET /api/t/:orgId/context
//   ['tenant', orgId, <module>, ...]    module data, for example ['tenant', id, 'booking', 'plan', siteId, date]
//   ['carrier', orgId, ...]             the same for /api/c/:orgId
//   ['platform', ...]                   /api/platform

export type Area = OrgKind;

export const queryKeys = {
  me: () => ['me'],
  org: (area: Exclude<Area, typeof OrgKind.platform>, orgId: string) => [area, orgId] as const,
  context: (area: Exclude<Area, typeof OrgKind.platform>, orgId: string) =>
    [area, orgId, 'context'] as const,
  platformContext: () => [OrgKind.platform, 'context'] as const,
};
