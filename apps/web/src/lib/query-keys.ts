// Query keys start with the area and the org id (ADR-0011), so switching org never shows another
// org's cached data, and `invalidateQueries({ queryKey: [area, orgId] })` refreshes one org.
//   ['me']                              the signed-in user and memberships
//   ['tenant', orgId, 'context']        GET /api/t/:orgId/context
//   ['tenant', orgId, <module>, ...]    module data, for example ['tenant', id, 'booking', 'plan', siteId, date]
//   ['carrier', orgId, ...]             the same for /api/c/:orgId
//   ['platform', ...]                   /api/platform

export type Area = 'tenant' | 'carrier' | 'platform';

export const queryKeys = {
  me: () => ['me'] as const,
  org: (area: Exclude<Area, 'platform'>, orgId: string) => [area, orgId] as const,
  context: (area: Exclude<Area, 'platform'>, orgId: string) => [area, orgId, 'context'] as const,
  platformContext: () => ['platform', 'context'] as const,
};
