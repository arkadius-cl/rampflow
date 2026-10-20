import {
  CreateDock,
  CreateHall,
  CreateSite,
  type DockView,
  type HallView,
  type SiteUsage,
  type SiteView,
  UpdateDock,
  UpdateHall,
  UpdateSite,
} from '@rampflow/shared/modules/core/api.sites';
import { Hono } from 'hono';
import * as z from 'zod';
import { idSchema } from '../../../db/ids.ts';
import { requirePermission } from '../../../kernel/access.ts';
import { op, type } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { validate } from '../../../kernel/validate.ts';
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
  .get(
    '/',
    op({
      id: 'core.sites.listSites',
      stories: ['MD-01'],
      description:
        'a site-limited operator sees only its sites; `{ items, usage: { sites, docks } }` counts active sites and active and maintenance docks against `core.max_sites` and `core.max_docks`',
      responses: {},
    }),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const items = (await listSites(c.var.db, tenantId)).map(siteView);
      const usage: SiteUsage = {
        sites: await countActiveSites(tenantId)(c.var.db),
        docks: await countCountedDocks(tenantId)(c.var.db),
      };
      return c.json({ items, usage }, 200);
    },
  )
  .post(
    '/',
    op({
      id: 'core.sites.createSite',
      stories: ['MD-01', 'MD-05'],
      description: 'seeds the three load types, imports holidays',
      limits: ['core.max_sites'],
      responses: { 201: type<SiteView>() },
    }),
    requirePermission('core.manage_sites'),
    validate('json', CreateSite),
    async (c) => {
      const row = await createSite(c.var.db, tenantRequest(c), c.var.clock, c.req.valid('json'));
      return c.json(siteView(row), 201);
    },
  )
  .get(
    '/:siteId',
    op({
      id: 'core.sites.getSite',
      stories: ['MD-01'],
      description: 'One site of the tenant; 404 for a site of another tenant.',
      responses: { 200: type<SiteView>() },
    }),
    validate('param', SiteParam),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const row = await requireSite(c.var.db, tenantId, c.req.valid('param').siteId);
      return c.json(siteView(row), 200);
    },
  )
  .patch(
    '/:siteId',
    op({
      id: 'core.sites.updateSite',
      stories: ['MD-01'],
      description: 'Checks `core.max_sites` when activating. Unknown zone answers 422',
      limits: ['core.max_sites'],
      responses: { 200: type<SiteView>() },
    }),
    requirePermission('core.manage_sites'),
    validate('param', SiteParam),
    validate('json', UpdateSite),
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
  .get(
    '/:siteId/halls',
    op({
      id: 'core.sites.listHalls',
      stories: ['MD-02'],
      description: 'The halls of a site.',
      responses: {},
    }),
    validate('param', SiteParam),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const items = await listHalls(c.var.db, tenantId, c.req.valid('param').siteId);
      return c.json({ items }, 200);
    },
  )
  .post(
    '/:siteId/halls',
    op({
      id: 'core.sites.createHall',
      stories: ['MD-02'],
      description: 'Adds a hall to a site.',
      responses: { 201: type<HallView>() },
    }),
    requirePermission('core.manage_sites'),
    validate('param', SiteParam),
    validate('json', CreateHall),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const { siteId } = c.req.valid('param');
      return c.json(await createHall(c.var.db, tenantId, siteId, c.req.valid('json')), 201);
    },
  )
  .patch(
    '/:siteId/halls/:hallId',
    op({
      id: 'core.sites.updateHall',
      stories: ['MD-02'],
      description: 'Renames or reorders a hall.',
      responses: { 200: type<HallView>() },
    }),
    requirePermission('core.manage_sites'),
    validate('param', HallParam),
    validate('json', UpdateHall),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const { siteId, hallId } = c.req.valid('param');
      const hall = await updateHall(c.var.db, tenantId, siteId, hallId, c.req.valid('json'));
      return c.json(hall, 200);
    },
  )
  .get(
    '/:siteId/docks',
    op({
      id: 'core.sites.listDocks',
      stories: ['MD-02'],
      description: 'The docks of a site.',
      responses: {},
    }),
    validate('param', SiteParam),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const items = await listDocks(c.var.db, tenantId, c.req.valid('param').siteId);
      return c.json({ items }, 200);
    },
  )
  .post(
    '/:siteId/docks',
    op({
      id: 'core.sites.createDock',
      stories: ['MD-02'],
      description:
        '409 `conflict` with reason `duplicate_code`; a hall of another site answers 422',
      limits: ['core.max_docks'],
      responses: { 201: type<DockView>() },
    }),
    requirePermission('core.manage_sites'),
    validate('param', SiteParam),
    validate('json', CreateDock),
    async (c) => {
      const { siteId } = c.req.valid('param');
      const dock = await createDock(c.var.db, tenantRequest(c), siteId, c.req.valid('json'));
      return c.json(dock, 201);
    },
  )
  .patch(
    '/:siteId/docks/:dockId',
    op({
      id: 'core.sites.updateDock',
      stories: ['MD-02'],
      description: 'Updates a dock. Checks `core.max_docks` when the dock leaves `inactive`.',
      limits: ['core.max_docks'],
      responses: { 200: type<DockView>() },
    }),
    requirePermission('core.manage_sites'),
    validate('param', DockParam),
    validate('json', UpdateDock),
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
