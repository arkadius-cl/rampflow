import type { Role } from '@rampflow/shared';
import type { PlatformContext } from '@rampflow/shared/modules/core/api.context';
import { Hono } from 'hono';
import { op, type } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';

/** GET /api/platform/context. */
export const platform = new Hono<AppEnv>().get(
  '/',
  op({
    id: 'core.context.getPlatformContext',
    stories: [],
    description: 'The platform context of the signed-in platform admin.',
    responses: { 200: type<PlatformContext>() },
  }),
  (c) => {
    const { access } = c.var;
    const body: PlatformContext = {
      role: access.role as Role,
      permissions: [...access.permissions],
    };
    return c.json(body, 200);
  },
);
