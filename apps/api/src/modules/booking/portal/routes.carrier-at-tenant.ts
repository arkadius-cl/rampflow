import { zValidator } from '@hono/zod-validator';
import type { Offers } from '@rampflow/shared/modules/booking/api.capacity';
import {
  CarrierCancel,
  CarrierReschedule,
  CreateCarrierBooking,
  PortalAvailabilityQuery,
  PortalLoadTypesQuery,
  type PortalOffers,
} from '@rampflow/shared/modules/booking/api.portal';
import { PutAvis, SendDriverLink } from '@rampflow/shared/modules/booking/api.staff';
import { type Context, Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { BookingId, CarrierId, SiteId, TenantId } from '../../../db/ids.ts';
import { requireEntitlement, requirePermission } from '../../../kernel/access.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { onInvalid } from '../../../kernel/validate.ts';
import { offersFor } from '../capacity/offers.ts';
import { assertActiveLink } from '../carriers/links.ts';
import { bookingContext } from '../lifecycle/context.ts';
import { createBooking } from '../lifecycle/create.ts';
import { loadTypeAt } from '../lifecycle/fit.ts';
import { transitionBooking } from '../lifecycle/transition.ts';
import type { LoadTypeId } from '../schema.resources.ts';
import { carrierLoadTypes, carrierSites, requireCarrierSite } from './master-data.ts';
import { loadPortalBooking } from './read.ts';
import { BookingParam, portalDriverLink } from './routes.carrier.ts';

// BK-04, BK-05, AV-02, CR-06 writes and the wizard's reads, under `carrier_at_tenant`. Every
// route needs an active link except cancel (TN-03): a deactivated carrier may still cancel.

function atTenant(c: Context<AppEnv>) {
  const { scope } = c.var;
  if (scope.party !== 'carrier_at_tenant') throw new Error(`portal write under ${scope.party}`);
  return { tenantId: scope.tenantId, carrierId: scope.carrierId };
}

const activeLink = createMiddleware<AppEnv>(async (c, next) => {
  const { tenantId, carrierId } = atTenant(c);
  await assertActiveLink(c.var.db, tenantId, carrierId);
  await next();
});

/** Resources stay internal: a carrier sees the site's offered starts, not its pools and docks. */
const forCarrier = ({ resources: _, ...offers }: Offers): PortalOffers => offers;

/** A lost race answers 409 with the refreshed starts, in the carrier's shape. */
async function withCarrierOffers<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    const offers = e instanceof ApiError ? e.details?.offers : undefined;
    if (!(e instanceof ApiError) || offers === undefined) throw e;
    throw new ApiError(e.code, e.message, { ...e.details, offers: forCarrier(offers as Offers) });
  }
}

function view(c: Context<AppEnv>, bookingId: BookingId) {
  const { tenantId, carrierId } = atTenant(c);
  const access = c.var.access;
  return loadPortalBooking(
    c.var.db,
    carrierId as CarrierId,
    bookingId,
    async (id: TenantId) => {
      if (id !== tenantId) throw new Error('booking outside the acting tenant');
      return access;
    },
    c.var.clock.now(),
  );
}

const book = requirePermission('booking.book');
const portal = requireEntitlement('booking.carrier_portal');

/** Mounted at `/api/c/:orgId/at/:tenantId` by modules/index.ts. */
export const carrierAtTenant = new Hono<AppEnv>()
  .get('/sites', book, portal, activeLink, async (c) => {
    const { tenantId } = atTenant(c);
    return c.json({ items: await carrierSites(c.var.db, c.var.access, tenantId) }, 200);
  })
  .get(
    '/load-types',
    book,
    portal,
    activeLink,
    zValidator('query', PortalLoadTypesQuery, onInvalid),
    async (c) => {
      const { tenantId } = atTenant(c);
      const siteId = c.req.valid('query').siteId as SiteId;
      await requireCarrierSite(c.var.db, tenantId, siteId);
      return c.json({ items: await carrierLoadTypes(c.var.db, tenantId, siteId) }, 200);
    },
  )
  .get(
    '/availability',
    book,
    portal,
    activeLink,
    zValidator('query', PortalAvailabilityQuery, onInvalid),
    async (c) => {
      const { tenantId } = atTenant(c);
      const q = c.req.valid('query');
      const siteId = q.siteId as SiteId;
      const loadTypeId = q.loadTypeId as LoadTypeId;
      await requireCarrierSite(c.var.db, tenantId, siteId);
      const lt = await loadTypeAt(c.var.db, tenantId, siteId, loadTypeId);
      if (!lt?.carrierBookable) throw new ApiError('not_found', 'No such load type');
      const { entitlements, setting } = c.var.access;
      if (!entitlements) throw new Error('carrier at a tenant without entitlements');
      const offers = await offersFor(
        c.var.db,
        { access: { setting, entitlements }, now: c.var.clock.now() },
        {
          tenantId,
          siteId,
          day: q.date,
          loadTypeId,
          loadUnits: q.loadUnits,
          audience: 'carrier',
        },
      );
      return c.json(forCarrier(offers), 200);
    },
  )
  .post(
    '/bookings',
    book,
    portal,
    activeLink,
    zValidator('json', CreateCarrierBooking, onInvalid),
    async (c) => {
      const body = c.req.valid('json');
      const result = await withCarrierOffers(() =>
        createBooking(bookingContext(c), {
          mode: 'carrier',
          clientRequestId: body.clientRequestId,
          siteId: body.siteId as SiteId,
          loadTypeId: body.loadTypeId as LoadTypeId,
          startsAt: new Date(body.startsAt),
          avis: body.avis,
        }),
      );
      return c.json(await view(c, result.booking.id), result.created ? 201 : 200);
    },
  )
  .patch(
    '/bookings/:bookingId',
    book,
    portal,
    activeLink,
    zValidator('param', BookingParam, onInvalid),
    zValidator('json', CarrierReschedule, onInvalid),
    async (c) => {
      const { bookingId } = c.req.valid('param');
      const body = c.req.valid('json');
      await withCarrierOffers(() =>
        transitionBooking(bookingContext(c), bookingId, {
          type: 'reschedule',
          startsAt: body.startsAt,
          version: body.version,
        }),
      );
      return c.json(await view(c, bookingId), 200);
    },
  )
  .post(
    '/bookings/:bookingId/cancel',
    book,
    portal,
    zValidator('param', BookingParam, onInvalid),
    zValidator('json', CarrierCancel, onInvalid),
    async (c) => {
      const { bookingId } = c.req.valid('param');
      const reason = c.req.valid('json').reason ?? null;
      await transitionBooking(bookingContext(c), bookingId, { type: 'cancel', reason });
      return c.json(await view(c, bookingId), 200);
    },
  )
  .put(
    '/bookings/:bookingId/avis',
    book,
    requireEntitlement('avis.basic'),
    activeLink,
    zValidator('param', BookingParam, onInvalid),
    zValidator('json', PutAvis, onInvalid),
    async (c) => {
      const { bookingId } = c.req.valid('param');
      const body = c.req.valid('json');
      await withCarrierOffers(() =>
        transitionBooking(bookingContext(c), bookingId, {
          type: 'update_avis',
          avis: body.avis,
          version: body.version,
        }),
      );
      return c.json(await view(c, bookingId), 200);
    },
  )
  .post(
    '/bookings/:bookingId/driver-link',
    book,
    activeLink,
    zValidator('param', BookingParam, onInvalid),
    async (c) => {
      const { bookingId } = c.req.valid('param');
      await transitionBooking(bookingContext(c), bookingId, { type: 'regenerate_driver_link' });
      return c.json(await portalDriverLink(c, bookingId), 200);
    },
  )
  .post(
    '/bookings/:bookingId/driver-link/email',
    book,
    requireEntitlement('notify.email'),
    activeLink,
    zValidator('param', BookingParam, onInvalid),
    zValidator('json', SendDriverLink, onInvalid),
    async (c) => {
      const { bookingId } = c.req.valid('param');
      await transitionBooking(bookingContext(c), bookingId, {
        type: 'send_driver_link',
        ...c.req.valid('json'),
      });
      return c.body(null, 202);
    },
  );
