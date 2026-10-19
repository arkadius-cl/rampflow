import { zValidator } from '@hono/zod-validator';
import {
  CreateDock,
  CreateHall,
  CreateSite,
  type SiteUsage,
  UpdateDock,
  UpdateHall,
  UpdateSite,
} from '@rampflow/shared/modules/core/api.sites';
import { Hono } from 'hono';
import * as z from 'zod';
import { idSchema } from '../../../db/ids.ts';
import { requirePermission } from '../../../kernel/access.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { onInvalid } from '../../../kernel/validate.ts';
import {
  countCountedDocks,
  createDock,
  createHall,
  listDocks,
  listHalls,
  updateDock,
  updateHall,
} from './docks.ts';
import {
  countActiveSites,
  createSite,
  listSites,
  requireSite,
  siteView,
  updateSite,
} from './sites.ts';
import { tenantRequest } from './tenant.ts';

const SiteParam = z.object({ siteId: idSchema<'site'>() });
const HallParam = SiteParam.extend({ hallId: idSchema<'hall'>() });
const DockParam = SiteParam.extend({ dockId: idSchema<'dock'>() });

/** Mounted at `/api/t/:orgId/sites` by modules/index.ts (MD-01, MD-02). */
export const tenant = new Hono<AppEnv>()
  .get('/', async (c) => {
    const { tenantId } = tenantRequest(c);
    const items = (await listSites(c.var.db, tenantId)).map(siteView);
    const usage: SiteUsage = {
      sites: await countActiveSites(tenantId)(c.var.db),
      docks: await countCountedDocks(tenantId)(c.var.db),
    };
    return c.json({ items, usage }, 200);
  })
  .post(
    '/',
    requirePermission('core.manage_sites'),
    zValidator('json', CreateSite, onInvalid),
    async (c) => {
      const row = await createSite(c.var.db, tenantRequest(c), c.var.clock, c.req.valid('json'));
      return c.json(siteView(row), 201);
    },
  )
  .get('/:siteId', zValidator('param', SiteParam, onInvalid), async (c) => {
    const { tenantId } = tenantRequest(c);
    const row = await requireSite(c.var.db, tenantId, c.req.valid('param').siteId);
    return c.json(siteView(row), 200);
  })
  .patch(
    '/:siteId',
    requirePermission('core.manage_sites'),
    zValidator('param', SiteParam, onInvalid),
    zValidator('json', UpdateSite, onInvalid),
    async (c) => {
      const { siteId } = c.req.valid('param');
      const row = await updateSite(
        c.var.db,
        tenantRequest(c),
        c.var.clock,
        siteId,
        c.req.valid('json'),
      );
      return c.json(siteView(row), 200);
    },
  )
  .get('/:siteId/halls', zValidator('param', SiteParam, onInvalid), async (c) => {
    const { tenantId } = tenantRequest(c);
    const items = await listHalls(c.var.db, tenantId, c.req.valid('param').siteId);
    return c.json({ items }, 200);
  })
  .post(
    '/:siteId/halls',
    requirePermission('core.manage_sites'),
    zValidator('param', SiteParam, onInvalid),
    zValidator('json', CreateHall, onInvalid),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const { siteId } = c.req.valid('param');
      return c.json(await createHall(c.var.db, tenantId, siteId, c.req.valid('json')), 201);
    },
  )
  .patch(
    '/:siteId/halls/:hallId',
    requirePermission('core.manage_sites'),
    zValidator('param', HallParam, onInvalid),
    zValidator('json', UpdateHall, onInvalid),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const { siteId, hallId } = c.req.valid('param');
      const hall = await updateHall(c.var.db, tenantId, siteId, hallId, c.req.valid('json'));
      return c.json(hall, 200);
    },
  )
  .get('/:siteId/docks', zValidator('param', SiteParam, onInvalid), async (c) => {
    const { tenantId } = tenantRequest(c);
    const items = await listDocks(c.var.db, tenantId, c.req.valid('param').siteId);
    return c.json({ items }, 200);
  })
  .post(
    '/:siteId/docks',
    requirePermission('core.manage_sites'),
    zValidator('param', SiteParam, onInvalid),
    zValidator('json', CreateDock, onInvalid),
    async (c) => {
      const { siteId } = c.req.valid('param');
      const dock = await createDock(c.var.db, tenantRequest(c), siteId, c.req.valid('json'));
      return c.json(dock, 201);
    },
  )
  .patch(
    '/:siteId/docks/:dockId',
    requirePermission('core.manage_sites'),
    zValidator('param', DockParam, onInvalid),
    zValidator('json', UpdateDock, onInvalid),
    async (c) => {
      const { siteId, dockId } = c.req.valid('param');
      const dock = await updateDock(
        c.var.db,
        tenantRequest(c),
        siteId,
        dockId,
        c.req.valid('json'),
      );
      return c.json(dock, 200);
    },
  );
