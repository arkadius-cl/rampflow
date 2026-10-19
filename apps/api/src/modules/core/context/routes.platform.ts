import type { Role } from '@rampflow/shared';
import type { PlatformContext } from '@rampflow/shared/modules/core/api.context';
import { Hono } from 'hono';
import type { AppEnv } from '../../../kernel/env.ts';

/** GET /api/platform/context. */
export const platform = new Hono<AppEnv>().get('/', (c) => {
  const { access } = c.var;
  const body: PlatformContext = {
    role: access.role as Role,
    permissions: [...access.permissions],
  };
  return c.json(body, 200);
});
