import { defineRouteCases, type RouteCase } from '../../../../test/route-cases.ts';
import type { World } from '../../../../test/world.ts';
import { briefingOf, contentFixture, seedBriefing } from './fixtures.ts';

const P = '/api/t/:orgId/safety';

const base = {
  as: 'tenant_admin',
  permission: 'safety.manage_briefings',
  entitlement: null,
  foreign: 'not_found',
  siteScoped: false,
  setup: async (w, o) => {
    await seedBriefing(o, w.A);
    await seedBriefing(o, w.B);
  },
} as const satisfies Partial<RouteCase>;

const org = (w: World) => ({ orgId: w.A.tenantId });

export const cases = defineRouteCases([
  { ...base, method: 'GET', path: `${P}/instructions`, params: org, foreign: 'empty' },
  {
    ...base,
    method: 'POST',
    path: `${P}/instructions`,
    params: org,
    // A's site makes the call foreign for B; for A it creates an instruction within the limit.
    body: (w) => ({ name: 'Hall rules', allSites: false, siteIds: [w.A.sites[0].id] }),
  },
  {
    ...base,
    method: 'PATCH',
    path: `${P}/instructions/:instructionId`,
    params: (w) => ({ ...org(w), instructionId: briefingOf(w.A).instructionId }),
    body: () => ({ name: 'Renamed' }),
  },
  {
    ...base,
    method: 'GET',
    path: `${P}/instructions/:instructionId/versions`,
    params: (w) => ({ ...org(w), instructionId: briefingOf(w.A).instructionId }),
  },
  {
    ...base,
    method: 'POST',
    path: `${P}/instructions/:instructionId/versions`,
    params: (w) => ({ ...org(w), instructionId: briefingOf(w.A).instructionId }),
  },
  {
    ...base,
    method: 'GET',
    path: `${P}/versions/:versionId`,
    params: (w) => ({ ...org(w), versionId: briefingOf(w.A).publishedId }),
  },
  {
    ...base,
    method: 'PUT',
    path: `${P}/versions/:versionId/content/:locale`,
    entitlement: 'safety.quiz',
    params: (w) => ({ ...org(w), versionId: briefingOf(w.A).draftId, locale: 'pl' }),
    body: () => contentFixture({ translation: 'machine' }),
  },
  {
    ...base,
    method: 'POST',
    path: `${P}/versions/:versionId/publish`,
    params: (w) => ({ ...org(w), versionId: briefingOf(w.A).draftId }),
    body: () => ({ materialChange: false }),
  },
]);
