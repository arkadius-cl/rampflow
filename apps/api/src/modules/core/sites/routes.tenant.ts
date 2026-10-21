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
import { Limit, Permission, Setting, StoryId, ValidationTarget } from '@rampflow/shared/values';
import { type Context, Hono } from 'hono';
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

const admittedCountries = async (c: Context<AppEnv>) =>
  (await c.var.access.setting(Setting.core.site_countries, null)).value;

const SiteParam = z.object({ siteId: idSchema<'site'>() });
const HallParam = SiteParam.extend({ hallId: idSchema<'hall'>() });
const DockParam = SiteParam.extend({ dockId: idSchema<'dock'>() });

/** Mounted at `/api/t/:orgId/sites` by modules/index.ts (MD-01, MD-02). */
export const tenant = new Hono<AppEnv>()
  .get(
    '/',
    op({
      id: 'core.sites.listSites',
      stories: [StoryId.MD_01],
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
      stories: [StoryId.MD_01, StoryId.MD_05],
      description: 'seeds the three load types, imports holidays',
      limits: [Limit.core.max_sites],
      responses: { 201: type<SiteView>() },
    }),
    requirePermission(Permission.core.manage_sites),
    validate(ValidationTarget.json, CreateSite),
    async (c) => {
      const row = await createSite(
        c.var.db,
        tenantRequest(c),
        c.var.clock,
        c.req.valid('json'),
        await admittedCountries(c),
      );
      return c.json(siteView(row), 201);
    },
  )
  .get(
    '/:siteId',
    op({
      id: 'core.sites.getSite',
      stories: [StoryId.MD_01],
      description: 'One site of the tenant; 404 for a site of another tenant.',
      responses: { 200: type<SiteView>() },
    }),
    validate(ValidationTarget.param, SiteParam),
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
      stories: [StoryId.MD_01],
      description: 'Checks `core.max_sites` when activating. Unknown zone answers 422',
      limits: [Limit.core.max_sites],
      responses: { 200: type<SiteView>() },
    }),
    requirePermission(Permission.core.manage_sites),
    validate(ValidationTarget.param, SiteParam),
    validate(ValidationTarget.json, UpdateSite),
    async (c) => {
      const { siteId } = c.req.valid('param');
      const row = await updateSite(
        c.var.db,
        tenantRequest(c),
        c.var.clock,
        siteId,
        c.req.valid('json'),
        await admittedCountries(c),
      );
      return c.json(siteView(row), 200);
    },
  )
  .get(
    '/:siteId/halls',
    op({
      id: 'core.sites.listHalls',
      stories: [StoryId.MD_02],
      description: 'The halls of a site.',
      responses: {},
    }),
    validate(ValidationTarget.param, SiteParam),
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
      stories: [StoryId.MD_02],
      description: 'Adds a hall to a site.',
      responses: { 201: type<HallView>() },
    }),
    requirePermission(Permission.core.manage_sites),
    validate(ValidationTarget.param, SiteParam),
    validate(ValidationTarget.json, CreateHall),
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
      stories: [StoryId.MD_02],
      description: 'Renames or reorders a hall.',
      responses: { 200: type<HallView>() },
    }),
    requirePermission(Permission.core.manage_sites),
    validate(ValidationTarget.param, HallParam),
    validate(ValidationTarget.json, UpdateHall),
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
      stories: [StoryId.MD_02],
      description: 'The docks of a site.',
      responses: {},
    }),
    validate(ValidationTarget.param, SiteParam),
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
      stories: [StoryId.MD_02],
      description:
        'Puts the dock into the default pool of its hall and profile, or a single resource of its own without `booking.pools`. 409 `conflict` with reason `duplicate_code`, or `dock_without_load_type` if its resource would serve no active load type; a hall of another site answers 422',
      limits: [Limit.core.max_docks],
      responses: { 201: type<DockView>() },
    }),
    requirePermission(Permission.core.manage_sites),
    validate(ValidationTarget.param, SiteParam),
    validate(ValidationTarget.json, CreateDock),
    async (c) => {
      const { siteId } = c.req.valid('param');
      const dock = await createDock(
        c.var.db,
        tenantRequest(c),
        c.var.clock,
        siteId,
        c.req.valid('json'),
      );
      return c.json(dock, 201);
    },
  )
  .patch(
    '/:siteId/docks/:dockId',
    op({
      id: 'core.sites.updateDock',
      stories: [StoryId.MD_02],
      description:
        'Updates a dock. Checks `core.max_docks` when the dock leaves `inactive`. A new profile updates its single resource or moves it from its pool to the default pool of its hall and new profile (403 `entitlement_required` without `booking.pools`); a new hall moves it out of a default pool; a dock in no resource is placed.',
      limits: [Limit.core.max_docks],
      responses: { 200: type<DockView>() },
    }),
    requirePermission(Permission.core.manage_sites),
    validate(ValidationTarget.param, DockParam),
    validate(ValidationTarget.json, UpdateDock),
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
