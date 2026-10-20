import { TranslationState } from '@rampflow/shared/modules/safety/values';
import { Feature, HttpMethod, Permission, Role } from '@rampflow/shared/values';
import { defineRouteCases, type RouteCase } from '../../../../test/route-cases.ts';
import type { World } from '../../../../test/world.ts';
import { briefingOf, contentFixture, seedBriefing } from './fixtures.ts';

const P = '/api/t/:orgId/safety';

const base = {
  as: Role.tenant_admin,
  permission: Permission.safety.manage_briefings,
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
  { ...base, method: HttpMethod.GET, path: `${P}/instructions`, params: org, foreign: 'empty' },
  {
    ...base,
    method: HttpMethod.POST,
    path: `${P}/instructions`,
    params: org,
    // A's site makes the call foreign for B; for A it creates an instruction within the limit.
    body: (w) => ({ name: 'Hall rules', allSites: false, siteIds: [w.A.sites[0].id] }),
  },
  {
    ...base,
    method: HttpMethod.PATCH,
    path: `${P}/instructions/:instructionId`,
    params: (w) => ({ ...org(w), instructionId: briefingOf(w.A).instructionId }),
    body: () => ({ name: 'Renamed' }),
  },
  {
    ...base,
    method: HttpMethod.GET,
    path: `${P}/instructions/:instructionId/versions`,
    params: (w) => ({ ...org(w), instructionId: briefingOf(w.A).instructionId }),
  },
  {
    ...base,
    method: HttpMethod.POST,
    path: `${P}/instructions/:instructionId/versions`,
    params: (w) => ({ ...org(w), instructionId: briefingOf(w.A).instructionId }),
  },
  {
    ...base,
    method: HttpMethod.GET,
    path: `${P}/versions/:versionId`,
    params: (w) => ({ ...org(w), versionId: briefingOf(w.A).publishedId }),
  },
  {
    ...base,
    method: HttpMethod.PUT,
    path: `${P}/versions/:versionId/content/:locale`,
    entitlement: Feature.safety.quiz,
    params: (w) => ({ ...org(w), versionId: briefingOf(w.A).draftId, locale: 'pl' }),
    body: () => contentFixture({ translation: TranslationState.machine }),
  },
  {
    ...base,
    method: HttpMethod.POST,
    path: `${P}/versions/:versionId/publish`,
    // The draft fixture has quiz questions, which only publish with safety.quiz on.
    entitlement: Feature.safety.quiz,
    params: (w) => ({ ...org(w), versionId: briefingOf(w.A).draftId }),
    body: () => ({ materialChange: false }),
  },
]);
