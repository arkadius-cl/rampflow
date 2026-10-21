import type { OnboardingView } from '@rampflow/shared/modules/core/api.onboarding';
import { Permission, StoryId } from '@rampflow/shared/values';
import { Hono } from 'hono';
import { requirePermission } from '../../../kernel/access.ts';
import { op, type } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { tenantRequest } from '../sites/tenant.ts';
import { onboardingView } from './onboarding.ts';

/** Mounted at `/api/t/:orgId/onboarding` by modules/index.ts (ON-01). */
export const tenant = new Hono<AppEnv>().get(
  '/',
  op({
    id: 'core.onboarding.getOnboarding',
    stories: [StoryId.ON_01],
    description:
      'The tenant status, its activation time and the steps `site`, `hall` and `dock` in that order, each with `done` and the `siteId` its link opens.',
    responses: { 200: type<OnboardingView>() },
  }),
  requirePermission(Permission.core.manage_sites),
  async (c) => c.json(await onboardingView(c.var.db, tenantRequest(c).tenantId), 200),
);
