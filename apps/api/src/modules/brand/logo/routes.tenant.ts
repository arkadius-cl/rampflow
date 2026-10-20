import { LOGO_MAX_BYTES } from '@rampflow/shared/modules/brand/api';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { requirePermission } from '../../../kernel/access.ts';
import { file, noBody, op } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { tenantRequest } from '../../core/sites/tenant.ts';
import { deleteLogo, parseLogo, readLogo, tooBig, writeLogo } from './logo.ts';

/** Mounted at `/api/t/:orgId/brand` by modules/index.ts, inside `withModule('brand')` (TN-05). */
export const tenant = new Hono<AppEnv>()
  .use(requirePermission('brand.manage'))
  .get(
    '/logo',
    op({
      id: 'brand.logo.getLogo',
      stories: ['TN-05'],
      description: '`{ logo: { url, contentType, byteSize, updatedAt } | null }`',
      responses: {},
    }),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      return c.json({ logo: await readLogo(c.var.db, tenantId) }, 200);
    },
  )
  .put(
    '/logo',
    op({
      id: 'brand.logo.putLogo',
      stories: ['TN-05'],
      description:
        'raw PNG or JPEG up to 256 KB, checked by magic bytes whatever the `Content-Type` → `{ logo }`. A larger body answers 422 with issue code `too_big`; SVG and anything else 422 `invalid_format`',
      body: file('image/png', 'image/jpeg'),
      responses: {},
    }),
    bodyLimit({
      maxSize: LOGO_MAX_BYTES,
      onError: () => {
        throw tooBig();
      },
    }),
    async (c) => {
      const { tenantId, userId } = tenantRequest(c);
      if (!userId) throw new Error('logo upload without a user');
      const logo = parseLogo(new Uint8Array(await c.req.arrayBuffer()));
      const view = await writeLogo(c.var.db, tenantId, logo, userId, c.var.clock.now());
      return c.json({ logo: view }, 200);
    },
  )
  .delete(
    '/logo',
    op({
      id: 'brand.logo.deleteLogo',
      stories: ['TN-05'],
      description: 'Removes the logo.',
      responses: { 204: noBody },
    }),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      await deleteLogo(c.var.db, tenantId);
      return c.body(null, 204);
    },
  );
