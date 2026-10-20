import type {
  PortalBookingListQuery,
  PortalBookingPage,
  PortalBookingView,
  PortalDriverLink,
  PortalLoadType,
  PortalOffers,
  PortalRebook,
  PortalSite,
} from '@rampflow/shared/modules/booking/api.portal';
import type { BookingStatus } from '@rampflow/shared/modules/booking/lifecycle';
import type { LocalDate } from '@rampflow/shared/time';
import { OrgKind } from '@rampflow/shared/values';
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { api, call } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

// Queries of the carrier portal. Every key starts with ['carrier', orgId, 'portal'], so one
// invalidation after a booking change refreshes the list, the detail and the offers.

export const portalKey = (orgId: string) =>
  [...queryKeys.org(OrgKind.carrier, orgId), 'portal'] as const;

const bookings = () => api.c[':orgId'].bookings;
const at = () => api.c[':orgId'].at[':tenantId'];

export interface BookingFilters {
  tenantId?: string;
  siteId?: string;
  status?: BookingStatus;
  when?: PortalBookingListQuery['when'];
  from?: LocalDate;
  to?: LocalDate;
  order: NonNullable<PortalBookingListQuery['order']>;
}

export const portalBookingsQuery = (orgId: string, f: BookingFilters) =>
  infiniteQueryOptions({
    queryKey: [...portalKey(orgId), 'list', f],
    queryFn: ({ pageParam }) =>
      call<PortalBookingPage>(
        bookings().$get({
          param: { orgId },
          query: {
            order: f.order,
            limit: '50',
            ...(f.tenantId ? { tenantId: f.tenantId } : {}),
            ...(f.siteId ? { siteId: f.siteId } : {}),
            ...(f.status ? { status: f.status } : {}),
            ...(f.when ? { when: f.when } : {}),
            ...(f.from ? { from: f.from } : {}),
            ...(f.to ? { to: f.to } : {}),
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        }),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

export const portalBookingQuery = (orgId: string, bookingId: string) =>
  queryOptions({
    queryKey: [...portalKey(orgId), 'detail', bookingId],
    queryFn: () =>
      call<PortalBookingView>(bookings()[':bookingId'].$get({ param: { orgId, bookingId } })),
  });

export const portalDriverLinkQuery = (orgId: string, bookingId: string) =>
  queryOptions({
    queryKey: [...portalKey(orgId), 'driver-link', bookingId],
    queryFn: () =>
      call<PortalDriverLink>(
        bookings()[':bookingId']['driver-link'].$get({ param: { orgId, bookingId } }),
      ),
    meta: { silent: true },
    retry: false,
  });

export const rebookQuery = (orgId: string, bookingId: string) =>
  queryOptions({
    queryKey: [...portalKey(orgId), 'rebook', bookingId],
    queryFn: () =>
      call<PortalRebook>(bookings()[':bookingId'].rebook.$get({ param: { orgId, bookingId } })),
    staleTime: Number.POSITIVE_INFINITY,
  });

export const portalSitesQuery = (orgId: string, tenantId: string) =>
  queryOptions({
    queryKey: [...portalKey(orgId), 'sites', tenantId],
    queryFn: () => call<{ items: PortalSite[] }>(at().sites.$get({ param: { orgId, tenantId } })),
    select: (data) => data.items,
    staleTime: 5 * 60_000,
  });

export const portalLoadTypesQuery = (orgId: string, tenantId: string, siteId: string) =>
  queryOptions({
    queryKey: [...portalKey(orgId), 'load-types', tenantId, siteId],
    queryFn: () =>
      call<{ items: PortalLoadType[] }>(
        at()['load-types'].$get({ param: { orgId, tenantId }, query: { siteId } }),
      ),
    select: (data) => data.items,
    staleTime: 5 * 60_000,
  });

export interface OfferRequest {
  tenantId: string;
  siteId: string;
  loadTypeId: string;
  loadUnits: number;
  date: LocalDate;
}

export const offersKey = (orgId: string, q: OfferRequest) =>
  [...portalKey(orgId), 'offers', q] as const;

export const portalOffersQuery = (orgId: string, q: OfferRequest) =>
  queryOptions({
    queryKey: offersKey(orgId, q),
    queryFn: () =>
      call<PortalOffers>(
        at().availability.$get({
          param: { orgId, tenantId: q.tenantId },
          query: {
            siteId: q.siteId,
            loadTypeId: q.loadTypeId,
            date: q.date,
            loadUnits: String(q.loadUnits),
          },
        }),
      ),
    staleTime: 30_000,
  });
