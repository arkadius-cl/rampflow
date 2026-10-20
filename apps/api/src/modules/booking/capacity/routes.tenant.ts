import {
  AvailabilityQuery,
  ClosureQuery,
  type ClosureView,
  CreateClosure,
  CreateLoadType,
  CreateResource,
  DockBooking,
  type LoadTypeView,
  type Offers,
  PutHours,
  PutLoadTypeResources,
  PutResourceDocks,
  type ResourceView,
  SiteQuery,
  UpdateLoadType,
  UpdateResource,
} from '@rampflow/shared/modules/booking/api.capacity';
import { CreatedParty } from '@rampflow/shared/modules/booking/values';
import { Permission, StoryId, ValidationTarget } from '@rampflow/shared/values';
import { Hono } from 'hono';
import * as z from 'zod';
import { idSchema, type SiteId } from '../../../db/ids.ts';
import { requirePermission } from '../../../kernel/access.ts';
import { noBody, op, type } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { validate } from '../../../kernel/validate.ts';
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
    op({
      id: 'booking.capacity.listResources',
      stories: [StoryId.MD_03],
      description: 'optional `?siteId=`',
      responses: {},
    }),
    requirePermission(Permission.booking.view),
    validate(ValidationTarget.query, ResourceListQuery),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const siteId = c.req.valid('query').siteId as SiteId | undefined;
      return c.json({ items: await listResources(c.var.db, tenantId, siteId) }, 200);
    },
  )
  .post(
    '/resources',
    op({
      id: 'booking.capacity.createResource',
      stories: [StoryId.MD_03],
      description:
        'Needs `booking.pools` for pools. `{ siteId, kind, name, directions, capacityCap?, dailyCap?, dockIds }`',
      responses: { 201: type<ResourceView>() },
    }),
    requirePermission(Permission.booking.manage_resources),
    validate(ValidationTarget.json, CreateResource),
    async (c) => c.json(await createResource(c.var.db, tenantRequest(c), c.req.valid('json')), 201),
  )
  .patch(
    '/resources/:resourceId',
    op({
      id: 'booking.capacity.updateResource',
      stories: [StoryId.MD_03],
      description: 'Needs `booking.pools` for pools. Never cancels bookings',
      responses: { 200: type<ResourceView>() },
    }),
    requirePermission(Permission.booking.manage_resources),
    validate(ValidationTarget.param, ResourceParam),
    validate(ValidationTarget.json, UpdateResource),
    async (c) => {
      const id = c.req.valid('param').resourceId;
      return c.json(await updateResource(c.var.db, tenantRequest(c), id, c.req.valid('json')), 200);
    },
  )
  .put(
    '/resources/:resourceId/docks',
    op({
      id: 'booking.capacity.setResourceDocks',
      stories: [StoryId.MD_03],
      description:
        'Needs `booking.pools` for pools. `{ dockIds }`; 409 `dock_in_resource` with `dockIds`',
      responses: { 200: type<ResourceView>() },
    }),
    requirePermission(Permission.booking.manage_resources),
    validate(ValidationTarget.param, ResourceParam),
    validate(ValidationTarget.json, PutResourceDocks),
    async (c) => {
      const id = c.req.valid('param').resourceId;
      const { dockIds } = c.req.valid('json');
      return c.json(await putResourceDocks(c.var.db, tenantRequest(c), id, dockIds), 200);
    },
  )
  .put(
    '/docks/:dockId/booking',
    op({
      id: 'booking.capacity.setDockBooking',
      stories: [StoryId.MD_03],
      description:
        "Needs `booking.pools` when a pool is left or joined. `{ as: 'none' } | { as: 'single', directions? } | { as: 'pool', resourceId }` moves the dock in one transaction and answers `{ resource }` (null for `none`); a single resource whose dock leaves is deactivated and reused, with its directions unless new ones are given, when the dock is booked as single again; a new single serves both directions; idempotent",
      responses: {},
    }),
    requirePermission(Permission.booking.manage_resources),
    validate(ValidationTarget.param, DockParam),
    validate(ValidationTarget.json, DockBooking),
    async (c) => {
      const { dockId } = c.req.valid('param');
      const resource = await bookDock(c.var.db, tenantRequest(c), dockId, c.req.valid('json'));
      return c.json({ resource }, 200);
    },
  )
  .get(
    '/hours',
    op({
      id: 'booking.capacity.listHours',
      stories: [StoryId.MD_04],
      description: '`?siteId=`',
      responses: {},
    }),
    requirePermission(Permission.booking.view),
    validate(ValidationTarget.query, SiteQuery),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const siteId = c.req.valid('query').siteId as SiteId;
      return c.json({ items: await listHours(c.var.db, tenantId, siteId) }, 200);
    },
  )
  .put(
    '/hours',
    op({
      id: 'booking.capacity.setHours',
      stories: [StoryId.MD_04],
      description: '`{ siteId, resourceId: uuid | null, rows: [{ weekday, opens, closes }] }`',
      responses: {},
    }),
    requirePermission(Permission.booking.manage_resources),
    validate(ValidationTarget.json, PutHours),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      return c.json({ items: await putHours(c.var.db, tenantId, c.req.valid('json')) }, 200);
    },
  )
  .get(
    '/closures',
    op({
      id: 'booking.capacity.listClosures',
      stories: [StoryId.MD_04],
      description: '`?siteId=&from=&to=`',
      responses: {},
    }),
    requirePermission(Permission.booking.view),
    validate(ValidationTarget.query, ClosureQuery),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const q = c.req.valid('query');
      const items = await listClosures(c.var.db, tenantId, { ...q, siteId: q.siteId as SiteId });
      return c.json({ items }, 200);
    },
  )
  .post(
    '/closures',
    op({
      id: 'booking.capacity.createClosure',
      stories: [StoryId.MD_04],
      description: 'Adds a closure to a site or resource.',
      responses: { 201: type<ClosureView>() },
    }),
    requirePermission(Permission.booking.manage_resources),
    validate(ValidationTarget.json, CreateClosure),
    async (c) => c.json(await createClosure(c.var.db, tenantRequest(c), c.req.valid('json')), 201),
  )
  .delete(
    '/closures/:closureId',
    op({
      id: 'booking.capacity.deleteClosure',
      stories: [StoryId.MD_04],
      description:
        'manual closures only, a holiday answers 409 `holiday_closure`; an unknown id answers 404',
      responses: { 204: noBody },
    }),
    requirePermission(Permission.booking.manage_resources),
    validate(ValidationTarget.param, ClosureParam),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      await deleteClosure(c.var.db, tenantId, c.req.valid('param').closureId);
      return c.body(null, 204);
    },
  )
  .post(
    '/closures/:closureId/reopen',
    op({
      id: 'booking.capacity.reopenClosure',
      stories: [StoryId.MD_04],
      description: 'holiday closures, a manual one answers 409 `manual_closure`; idempotent',
      responses: { 200: type<ClosureView>() },
    }),
    requirePermission(Permission.booking.manage_resources),
    validate(ValidationTarget.param, ClosureParam),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const id = c.req.valid('param').closureId;
      return c.json(await reopenHoliday(c.var.db, tenantId, id, c.var.clock.now()), 200);
    },
  )
  .get(
    '/load-types',
    op({
      id: 'booking.capacity.listLoadTypes',
      stories: [StoryId.MD_05],
      description: '`?siteId=`',
      responses: {},
    }),
    requirePermission(Permission.booking.view),
    validate(ValidationTarget.query, SiteQuery),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const siteId = c.req.valid('query').siteId as SiteId;
      return c.json({ items: await listLoadTypes(c.var.db, tenantId, siteId) }, 200);
    },
  )
  .post(
    '/load-types',
    op({
      id: 'booking.capacity.createLoadType',
      stories: [StoryId.MD_05],
      description: 'Needs `booking.duration_rules` for tiers. Adds a load type.',
      responses: { 201: type<LoadTypeView>() },
    }),
    requirePermission(Permission.booking.manage_resources),
    validate(ValidationTarget.json, CreateLoadType),
    async (c) => c.json(await createLoadType(c.var.db, tenantRequest(c), c.req.valid('json')), 201),
  )
  .patch(
    '/load-types/:loadTypeId',
    op({
      id: 'booking.capacity.updateLoadType',
      stories: [StoryId.MD_05],
      description: 'Needs `booking.duration_rules` for tiers. Updates a load type.',
      responses: { 200: type<LoadTypeView>() },
    }),
    requirePermission(Permission.booking.manage_resources),
    validate(ValidationTarget.param, LoadTypeParam),
    validate(ValidationTarget.json, UpdateLoadType),
    async (c) => {
      const id = c.req.valid('param').loadTypeId;
      return c.json(await updateLoadType(c.var.db, tenantRequest(c), id, c.req.valid('json')), 200);
    },
  )
  .put(
    '/load-types/:loadTypeId/resources',
    op({
      id: 'booking.capacity.setLoadTypeResources',
      stories: [StoryId.MD_05],
      description: 'Sets the resources that take a load type.',
      responses: { 200: type<LoadTypeView>() },
    }),
    requirePermission(Permission.booking.manage_resources),
    validate(ValidationTarget.param, LoadTypeParam),
    validate(ValidationTarget.json, PutLoadTypeResources),
    async (c) => {
      const { tenantId } = tenantRequest(c);
      const id = c.req.valid('param').loadTypeId;
      const { resourceIds } = c.req.valid('json');
      return c.json(await putLoadTypeResources(c.var.db, tenantId, id, resourceIds), 200);
    },
  )
  .get(
    '/availability',
    op({
      id: 'booking.capacity.getAvailability',
      stories: [StoryId.MD_04, StoryId.BK_02],
      description:
        '`?siteId&date&loadTypeId&loadUnits&resourceId?`; offered starts per resource and their union (`Offers` in `api.capacity.ts`), staff view without lead time and horizon',
      responses: { 200: type<Offers>() },
    }),
    requirePermission(Permission.booking.view),
    validate(ValidationTarget.query, AvailabilityQuery),
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
          audience: CreatedParty.staff,
        },
      );
      return c.json(offers, 200);
    },
  );
