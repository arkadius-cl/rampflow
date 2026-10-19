import type { LoadTypeView, Offers } from '@rampflow/shared/modules/booking/api.capacity';
import type {
  BoardView,
  BookingEventView,
  BookingPage,
  BookingView,
  CarrierOption,
  DriverLinkView,
} from '@rampflow/shared/modules/booking/api.staff';
import type { LocalDate } from '@rampflow/shared/time';
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { api, call } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

// Queries of the plan board and the booking screens. Every key starts with
// ['tenant', orgId, 'booking'], so one invalidation of `bookingKey(orgId)` after a change
// refreshes the board, the list, the open detail and its timeline.

export const bookingKey = (orgId: string) =>
  [...queryKeys.org('tenant', orgId), 'booking'] as const;

const bookings = () => api.t[':orgId'].bookings;
const capacity = () => api.t[':orgId'].capacity;

/** BK-01: a booking made elsewhere shows within 30 seconds; the API route says 15. */
export const BOARD_POLL_MS = 15_000;

export const boardQuery = (orgId: string, siteId: string, date: LocalDate) =>
  queryOptions({
    queryKey: [...bookingKey(orgId), 'board', siteId, date],
    queryFn: () =>
      call<BoardView>(bookings().board.$get({ param: { orgId }, query: { siteId, date } })),
    refetchInterval: BOARD_POLL_MS,
  });

export const bookingListQuery = (orgId: string, siteId: string, date: LocalDate) =>
  infiniteQueryOptions({
    queryKey: [...bookingKey(orgId), 'list', siteId, date],
    queryFn: ({ pageParam }) =>
      call<BookingPage>(
        bookings().$get({
          param: { orgId },
          query: { siteId, date, limit: '100', ...(pageParam ? { cursor: pageParam } : {}) },
        }),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: BOARD_POLL_MS,
  });

export const bookingQuery = (orgId: string, bookingId: string) =>
  queryOptions({
    queryKey: [...bookingKey(orgId), 'detail', bookingId],
    queryFn: () =>
      call<BookingView>(bookings()[':bookingId'].$get({ param: { orgId, bookingId } })),
  });

export const bookingEventsQuery = (orgId: string, bookingId: string) =>
  queryOptions({
    queryKey: [...bookingKey(orgId), 'events', bookingId],
    queryFn: () =>
      call<{ items: BookingEventView[]; nextCursor: string | null }>(
        bookings()[':bookingId'].events.$get({
          param: { orgId, bookingId },
          query: { limit: '200' },
        }),
      ),
    select: (page) => page.items,
  });

export const carrierOptionsQuery = (orgId: string) =>
  queryOptions({
    queryKey: [...bookingKey(orgId), 'carrier-options'],
    queryFn: () =>
      call<{ items: CarrierOption[] }>(
        bookings()['carrier-options'].$get({ param: { orgId }, query: {} }),
      ),
    select: (data) => data.items,
    staleTime: 60_000,
  });

export const loadTypesQuery = (orgId: string, siteId: string) =>
  queryOptions({
    queryKey: [...bookingKey(orgId), 'load-types', siteId],
    queryFn: () =>
      call<{ items: LoadTypeView[] }>(
        capacity()['load-types'].$get({ param: { orgId }, query: { siteId } }),
      ),
    select: (data) => data.items.filter((lt) => lt.active),
    staleTime: 60_000,
  });

export const availabilityQuery = (
  orgId: string,
  q: {
    siteId: string;
    date: LocalDate;
    loadTypeId: string;
    loadUnits: number;
    resourceId?: string;
  },
) =>
  queryOptions({
    queryKey: [...bookingKey(orgId), 'availability', q],
    queryFn: () =>
      call<Offers>(
        capacity().availability.$get({
          param: { orgId },
          query: {
            siteId: q.siteId,
            date: q.date,
            loadTypeId: q.loadTypeId,
            loadUnits: String(q.loadUnits),
            ...(q.resourceId ? { resourceId: q.resourceId } : {}),
          },
        }),
      ),
  });

export const driverLinkQuery = (orgId: string, bookingId: string) =>
  queryOptions({
    queryKey: [...bookingKey(orgId), 'driver-link', bookingId],
    queryFn: () =>
      call<DriverLinkView>(
        bookings()[':bookingId']['driver-link'].$get({ param: { orgId, bookingId } }),
      ),
    meta: { silent: true },
    retry: false,
  });
