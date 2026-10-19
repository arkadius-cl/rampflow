import { zValidator } from '@hono/zod-validator';
import { PutTenantSetting, SettingsQuery } from '@rampflow/shared/modules/core/api.settings';
import type { Context } from 'hono';
import { Hono } from 'hono';
import * as z from 'zod';
import type { SiteId } from '../../../db/ids.ts';
import { requirePermission } from '../../../kernel/access.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { onInvalid } from '../../../kernel/validate.ts';
import { requireSite } from '../sites/sites.ts';
import { tenantRequest } from '../sites/tenant.ts';
import { resetSetting, type SettingTarget, settingsView, writeSetting } from './settings.ts';

const KeyParam = z.object({ key: z.string().min(1).max(100) });

/** The tenant level, or a site the caller may see (404 for another tenant's or a hidden site). */
async function targetOf(c: Context<AppEnv>, siteId: string | null | undefined) {
  const req = tenantRequest(c);
  if (!siteId) return { req, target: { scope: 'tenant', tenantId: req.tenantId } as SettingTarget };
  await requireSite(c.var.db, req.tenantId, siteId as SiteId);
  const target: SettingTarget = { scope: 'site', tenantId: req.tenantId, siteId: siteId as SiteId };
  return { req, target };
}

/** Mounted at `/api/t/:orgId/settings` by modules/index.ts (TN-02). */
export const tenant = new Hono<AppEnv>()
  .use(requirePermission('core.manage_settings'))
  .get('/', zValidator('query', SettingsQuery, onInvalid), async (c) => {
    const { req, target } = await targetOf(c, c.req.valid('query').siteId);
    return c.json(await settingsView(c.var.db, target, req.entitlements), 200);
  })
  .put(
    '/:key',
    zValidator('param', KeyParam, onInvalid),
    zValidator('json', PutTenantSetting, onInvalid),
    async (c) => {
      const { siteId, value } = c.req.valid('json');
      const { req, target } = await targetOf(c, siteId);
      if (!req.userId) throw new Error('settings write without a user');
      const entry = await writeSetting(
        c.var.db,
        target,
        req.entitlements,
        { key: c.req.valid('param').key, value },
        req.userId,
        c.var.clock.now(),
      );
      return c.json(entry, 200);
    },
  )
  .delete(
    '/:key',
    zValidator('param', KeyParam, onInvalid),
    zValidator('query', SettingsQuery, onInvalid),
    async (c) => {
      const { target } = await targetOf(c, c.req.valid('query').siteId);
      await resetSetting(c.var.db, target, c.req.valid('param').key);
      return c.body(null, 204);
    },
  );
