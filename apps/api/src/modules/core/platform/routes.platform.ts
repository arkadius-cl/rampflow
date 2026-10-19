import { zValidator } from '@hono/zod-validator';
import {
  CreateTenant,
  InviteTenantAdmin,
  PutOverride,
  UpdateTenant,
} from '@rampflow/shared/modules/core/api.platform';
import { PutPlatformSetting } from '@rampflow/shared/modules/core/api.settings';
import type { Context } from 'hono';
import { Hono } from 'hono';
import * as z from 'zod';
import { idSchema, type TenantId } from '../../../db/ids.ts';
import { requirePermission } from '../../../kernel/access.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { onInvalid } from '../../../kernel/validate.ts';
import { resetSetting, settingsView, writeSetting } from '../settings/settings.ts';
import { invitationView } from '../staff/invitations.ts';
import {
  createTenant,
  deleteOverride,
  inviteTenantAdmin,
  listTenants,
  packageList,
  putOverride,
  tenantDetail,
  updateTenant,
} from './tenants.ts';

const TenantParam = z.object({ tenantId: idSchema<'tenant'>() });
const OverrideParam = TenantParam.extend({ key: z.string().min(1).max(100) });
const KeyParam = z.object({ key: z.string().min(1).max(100) });

const PLATFORM = { scope: 'platform' } as const;

function platformUser(c: Context<AppEnv>) {
  const { scope } = c.var;
  if (scope.party !== 'platform') throw new Error(`platform route under party ${scope.party}`);
  return scope.userId;
}

/** The language of emails the platform sends: the platform default locale. */
const platformLocale = async (c: Context<AppEnv>) =>
  (await c.var.access.setting('i18n.default_locale', null)).value;

const tenants = requirePermission('core.manage_tenants');
const settings = requirePermission('core.manage_platform_settings');

/** Mounted at `/api/platform` by modules/index.ts (PL-01 to PL-04). */
export const platform = new Hono<AppEnv>()
  .get('/tenants', tenants, async (c) =>
    c.json({ items: await listTenants(c.var.db, c.var.clock.now()) }, 200),
  )
  .post('/tenants', tenants, zValidator('json', CreateTenant, onInvalid), async (c) => {
    const now = c.var.clock.now();
    const id = await createTenant(
      c.var.db,
      { ...c.req.valid('json'), createdBy: platformUser(c), locale: await platformLocale(c) },
      now,
    );
    return c.json(await tenantDetail(c.var.db, id, now), 201);
  })
  .get('/tenants/:tenantId', tenants, zValidator('param', TenantParam, onInvalid), async (c) => {
    const { tenantId } = c.req.valid('param');
    return c.json(await tenantDetail(c.var.db, tenantId as TenantId, c.var.clock.now()), 200);
  })
  .patch(
    '/tenants/:tenantId',
    tenants,
    zValidator('param', TenantParam, onInvalid),
    zValidator('json', UpdateTenant, onInvalid),
    async (c) => {
      const tenantId = c.req.valid('param').tenantId as TenantId;
      const now = c.var.clock.now();
      await updateTenant(c.var.db, tenantId, c.req.valid('json'), platformUser(c), now);
      return c.json(await tenantDetail(c.var.db, tenantId, now), 200);
    },
  )
  .put(
    '/tenants/:tenantId/overrides/:key',
    tenants,
    zValidator('param', OverrideParam, onInvalid),
    zValidator('json', PutOverride, onInvalid),
    async (c) => {
      const { tenantId, key } = c.req.valid('param');
      const view = await putOverride(
        c.var.db,
        tenantId as TenantId,
        key,
        c.req.valid('json'),
        platformUser(c),
        c.var.clock.now(),
      );
      return c.json(view, 200);
    },
  )
  .delete(
    '/tenants/:tenantId/overrides/:key',
    tenants,
    zValidator('param', OverrideParam, onInvalid),
    async (c) => {
      const { tenantId, key } = c.req.valid('param');
      await deleteOverride(c.var.db, tenantId as TenantId, key);
      return c.body(null, 204);
    },
  )
  .post(
    '/tenants/:tenantId/invitations',
    tenants,
    zValidator('param', TenantParam, onInvalid),
    zValidator('json', InviteTenantAdmin, onInvalid),
    async (c) => {
      const now = c.var.clock.now();
      const row = await inviteTenantAdmin(
        c.var.db,
        c.req.valid('param').tenantId as TenantId,
        c.req.valid('json').email,
        platformUser(c),
        await platformLocale(c),
        now,
      );
      return c.json(invitationView(row, now), 201);
    },
  )
  .get('/packages', tenants, (c) => c.json(packageList(), 200))
  .get('/settings', settings, async (c) =>
    c.json(await settingsView(c.var.db, PLATFORM, null), 200),
  )
  .put(
    '/settings/:key',
    settings,
    zValidator('param', KeyParam, onInvalid),
    zValidator('json', PutPlatformSetting, onInvalid),
    async (c) => {
      const entry = await writeSetting(
        c.var.db,
        PLATFORM,
        null,
        { key: c.req.valid('param').key, value: c.req.valid('json').value },
        platformUser(c),
        c.var.clock.now(),
      );
      return c.json(entry, 200);
    },
  )
  .delete('/settings/:key', settings, zValidator('param', KeyParam, onInvalid), async (c) => {
    await resetSetting(c.var.db, PLATFORM, c.req.valid('param').key);
    return c.body(null, 204);
  });
