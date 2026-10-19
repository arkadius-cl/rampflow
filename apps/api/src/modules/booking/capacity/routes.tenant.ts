import { zValidator } from '@hono/zod-validator';
import {
  AvailabilityQuery,
  ClosureQuery,
  CreateClosure,
  CreateLoadType,
  CreateResource,
  DockBooking,
  PutHours,
  PutLoadTypeResources,
  PutResourceDocks,
  SiteQuery,
  UpdateLoadType,
  UpdateResource,
} from '@rampflow/shared/modules/booking/api.capacity';
import { Hono } from 'hono';
import * as z from 'zod';
import { idSchema, type SiteId } from '../../../db/ids.ts';
import { requirePermission } from '../../../kernel/access.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { onInvalid } from '../../../kernel/validate.ts';
import { requireSite } from '../../core/sites/sites.ts';
import { tenantRequest } from '../../core/sites/tenant.ts';
import type { LoadTypeId, ResourceId } from '../schema.resources.ts';
import { createClosure, deleteClosure, listClosures, reopenHoliday } from './closures.ts';
import { listHours, putHours } from './hours.ts';
import {
  createLoadType,
  listLoadTypes,
  putLoadTypeResources,
  updateLoadType,
} from './load-types.ts';
import { offersFor } from './offers.ts';
import {
  bookDock,
  createResource,
  listResources,
  putResourceDocks,
  updateResource,
} from './resources.ts';

const ResourceParam = z.object({ resourceId: idSchema<'resource'>() });
const DockParam = z.object({ dockId: idSchema<'dock'>() });
const ClosureParam = z.object({ closureId: idSchema<'closure'>() });
const LoadTypeParam = z.object({ loadTypeId: idSchema<'load_type'>() });
const ResourceListQuery = z.object({ siteId: z.uuid().optional() });

/** Mounted at `/api/t/:orgId/capacity` by modules/index.ts (MD-03, MD-04, MD-05). */
export const tenant = new Hono<AppEnv>()
  .get(
    '/resources',
    requirePermission('booking.view'),
    zValidator('query', ResourceListQuery, onInvalid),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const siteId = c.req.valid('query').siteId as SiteId | undefined;
      return c.json({ items: await listResources(c.var.db, tenantId, siteId) }, 200);
    },
  )
  .post(
    '/resources',
    requirePermission('booking.manage_resources'),
    zValidator('json', CreateResource, onInvalid),
    async (c) => c.json(await createResource(c.var.db, tenantRequest(c), c.req.valid('json')), 201),
  )
  .patch(
    '/resources/:resourceId',
    requirePermission('booking.manage_resources'),
    zValidator('param', ResourceParam, onInvalid),
    zValidator('json', UpdateResource, onInvalid),
    async (c) => {
      const id = c.req.valid('param').resourceId;
      return c.json(await updateResource(c.var.db, tenantRequest(c), id, c.req.valid('json')), 200);
    },
  )
  .put(
    '/resources/:resourceId/docks',
    requirePermission('booking.manage_resources'),
    zValidator('param', ResourceParam, onInvalid),
    zValidator('json', PutResourceDocks, onInvalid),
    async (c) => {
      const id = c.req.valid('param').resourceId;
      const { dockIds } = c.req.valid('json');
      return c.json(await putResourceDocks(c.var.db, tenantRequest(c), id, dockIds), 200);
    },
  )
  .put(
    '/docks/:dockId/booking',
    requirePermission('booking.manage_resources'),
    zValidator('param', DockParam, onInvalid),
    zValidator('json', DockBooking, onInvalid),
    async (c) => {
      const { dockId } = c.req.valid('param');
      const resource = await bookDock(c.var.db, tenantRequest(c), dockId, c.req.valid('json'));
      return c.json({ resource }, 200);
    },
  )
  .get(
    '/hours',
    requirePermission('booking.view'),
    zValidator('query', SiteQuery, onInvalid),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const siteId = c.req.valid('query').siteId as SiteId;
      return c.json({ items: await listHours(c.var.db, tenantId, siteId) }, 200);
    },
  )
  .put(
    '/hours',
    requirePermission('booking.manage_resources'),
    zValidator('json', PutHours, onInvalid),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      return c.json({ items: await putHours(c.var.db, tenantId, c.req.valid('json')) }, 200);
    },
  )
  .get(
    '/closures',
    requirePermission('booking.view'),
    zValidator('query', ClosureQuery, onInvalid),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const q = c.req.valid('query');
      const items = await listClosures(c.var.db, tenantId, { ...q, siteId: q.siteId as SiteId });
      return c.json({ items }, 200);
    },
  )
  .post(
    '/closures',
    requirePermission('booking.manage_resources'),
    zValidator('json', CreateClosure, onInvalid),
    async (c) => c.json(await createClosure(c.var.db, tenantRequest(c), c.req.valid('json')), 201),
  )
  .delete(
    '/closures/:closureId',
    requirePermission('booking.manage_resources'),
    zValidator('param', ClosureParam, onInvalid),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      await deleteClosure(c.var.db, tenantId, c.req.valid('param').closureId);
      return c.body(null, 204);
    },
  )
  .post(
    '/closures/:closureId/reopen',
    requirePermission('booking.manage_resources'),
    zValidator('param', ClosureParam, onInvalid),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const id = c.req.valid('param').closureId;
      return c.json(await reopenHoliday(c.var.db, tenantId, id, c.var.clock.now()), 200);
    },
  )
  .get(
    '/load-types',
    requirePermission('booking.view'),
    zValidator('query', SiteQuery, onInvalid),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const siteId = c.req.valid('query').siteId as SiteId;
      return c.json({ items: await listLoadTypes(c.var.db, tenantId, siteId) }, 200);
    },
  )
  .post(
    '/load-types',
    requirePermission('booking.manage_resources'),
    zValidator('json', CreateLoadType, onInvalid),
    async (c) => c.json(await createLoadType(c.var.db, tenantRequest(c), c.req.valid('json')), 201),
  )
  .patch(
    '/load-types/:loadTypeId',
    requirePermission('booking.manage_resources'),
    zValidator('param', LoadTypeParam, onInvalid),
    zValidator('json', UpdateLoadType, onInvalid),
    async (c) => {
      const id = c.req.valid('param').loadTypeId;
      return c.json(await updateLoadType(c.var.db, tenantRequest(c), id, c.req.valid('json')), 200);
    },
  )
  .put(
    '/load-types/:loadTypeId/resources',
    requirePermission('booking.manage_resources'),
    zValidator('param', LoadTypeParam, onInvalid),
    zValidator('json', PutLoadTypeResources, onInvalid),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const id = c.req.valid('param').loadTypeId;
      const { resourceIds } = c.req.valid('json');
      return c.json(await putLoadTypeResources(c.var.db, tenantId, id, resourceIds), 200);
    },
  )
  .get(
    '/availability',
    requirePermission('booking.view'),
    zValidator('query', AvailabilityQuery, onInvalid),
    async (c) => {
      const req = tenantRequest(c);
      const q = c.req.valid('query');
      const siteId = q.siteId as SiteId;
      await requireSite(c.var.db, req.tenantId, siteId);
      const offers = await offersFor(
        c.var.db,
        {
          access: { setting: c.var.access.setting, entitlements: req.entitlements },
          now: c.var.clock.now(),
        },
        {
          tenantId: req.tenantId,
          siteId,
          day: q.date,
          loadTypeId: q.loadTypeId as LoadTypeId,
          loadUnits: q.loadUnits,
          resourceId: q.resourceId as ResourceId | undefined,
          audience: 'staff',
        },
      );
      return c.json(offers, 200);
    },
  );
