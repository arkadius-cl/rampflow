import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import * as z from 'zod';
import { idSchema, type TenantId } from '../../../db/ids.ts';
import { type Scope, withScope } from '../../../db/scope.ts';
import { loadAccess } from '../../../kernel/access.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { onInvalid } from '../../../kernel/validate.ts';
import { logoBytes } from './logo.ts';

const LogoParam = z.object({
  tenantId: idSchema<'tenant'>(),
  sha: z.string().regex(/^[0-9a-f]{64}$/),
});

/**
 * Mounted at `/api/public/logos` by modules/index.ts (TN-05). Serves the logo to carrier pages,
 * emails and the driver PWA while the tenant's `brand.logo` is on. The hash in the URL makes the
 * answer immutable.
 */
export const publicApi = new Hono<AppEnv>().get(
  '/:tenantId/:sha',
  zValidator('param', LogoParam, onInvalid),
  async (c) => {
    const { tenantId, sha } = c.req.valid('param');
    const scope: Scope = { party: 'public', tenantId: tenantId as TenantId, siteId: null };
    const logo = await withScope(scope, async (tx) => {
      const { entitlements } = await loadAccess(tx, scope, c.var.clock);
      if (!entitlements?.modules.brand) return null;
      return logoBytes(tx, tenantId as TenantId, sha);
    });
    if (!logo) throw new ApiError('not_found');
    return c.body(new Uint8Array(logo.bytes), 200, {
      'Content-Type': logo.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
  },
);
