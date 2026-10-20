import type { LoadTypeView } from '@rampflow/shared/modules/booking/api.capacity';
import type { TurnAwayReason } from '@rampflow/shared/modules/booking/values';
import type {
  CallResult,
  CandidatesView,
  DocksView,
  ExpectedView,
  OnSiteView,
  SearchView,
  WalkInBody,
  WalkInResult,
  YardTruck,
} from '@rampflow/shared/modules/yard/api';
import { OrgKind } from '@rampflow/shared/values';
import {
  queryOptions,
  type UseMutationOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { api, call } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

// Server state of the gate and dock stations. Lists poll every 15 s and keep their last answer
// while offline; every command refreshes all yard lists of the org.

const POLL_MS = 15_000;

export const yardKey = (orgId: string) =>
  [...queryKeys.org(OrgKind.tenant, orgId), 'yard'] as const;

const yard = api.t[':orgId'].yard;

export const expectedQuery = (orgId: string, siteId: string) =>
  queryOptions({
    queryKey: [...yardKey(orgId), 'expected', siteId],
    queryFn: () => call<ExpectedView>(yard.expected.$get({ param: { orgId }, query: { siteId } })),
    refetchInterval: POLL_MS,
  });

export const onSiteQuery = (orgId: string, siteId: string) =>
  queryOptions({
    queryKey: [...yardKey(orgId), 'on-site', siteId],
    queryFn: () => call<OnSiteView>(yard['on-site'].$get({ param: { orgId }, query: { siteId } })),
    refetchInterval: POLL_MS,
  });

export const docksQuery = (orgId: string, siteId: string) =>
  queryOptions({
    queryKey: [...yardKey(orgId), 'docks', siteId],
    queryFn: () => call<DocksView>(yard.docks.$get({ param: { orgId }, query: { siteId } })),
    refetchInterval: POLL_MS,
  });

export const searchQuery = (orgId: string, siteId: string, q: string) =>
  queryOptions({
    queryKey: [...yardKey(orgId), 'search', siteId, q],
    queryFn: () => call<SearchView>(yard.search.$post({ param: { orgId }, json: { siteId, q } })),
    enabled: q.length >= 2,
  });

export const loadTypesQuery = (orgId: string, siteId: string) =>
  queryOptions({
    queryKey: [...queryKeys.org(OrgKind.tenant, orgId), 'booking', 'load-types', siteId],
    queryFn: () =>
      call<{ items: LoadTypeView[] }>(
        api.t[':orgId'].capacity['load-types'].$get({ param: { orgId }, query: { siteId } }),
      ),
    staleTime: 60_000,
  });

/** A mutation that refreshes the yard lists when it settles. */
export function useYardMutation<TVars, TData>(
  orgId: string,
  mutationFn: (vars: TVars) => Promise<TData>,
  options: Omit<UseMutationOptions<TData, Error, TVars>, 'mutationFn'> = {},
) {
  const queryClient = useQueryClient();
  return useMutation<TData, Error, TVars>({
    ...options,
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: yardKey(orgId) }),
  });
}

export const yardApi = (orgId: string) => {
  const b = yard.bookings[':bookingId'];
  const at = (bookingId: string) => ({ param: { orgId, bookingId } });
  return {
    checkIn: (id: string, plateSeen: string | null) =>
      call<YardTruck>(b['check-in'].$post({ ...at(id), json: { plateSeen } })),
    turnAway: (id: string, reason: TurnAwayReason) =>
      call<YardTruck>(b['turn-away'].$post({ ...at(id), json: { reason } })),
    depart: (id: string, reason: string | undefined) =>
      call<YardTruck>(b.depart.$post({ ...at(id), json: reason ? { reason } : {} })),
    walkIn: (body: WalkInBody) =>
      call<WalkInResult>(yard['walk-ins'].$post({ param: { orgId }, json: body })),
    candidates: (id: string, name: string) =>
      call<CandidatesView>(b['acknowledgement-candidates'].$post({ ...at(id), json: { name } })),
    link: (id: string, acknowledgementId: string) =>
      call<YardTruck>(b.acknowledgements.$post({ ...at(id), json: { acknowledgementId } })),
    briefingSession: (id: string) =>
      call<{ url: string; expiresAt: string }>(b['briefing-session'].$post(at(id))),
    call: (id: string, dockId: string) =>
      call<CallResult>(b.call.$post({ ...at(id), json: { dockId } })),
    uncall: (id: string) => call<YardTruck>(b.uncall.$post(at(id))),
    dock: (id: string) => call<YardTruck>(b.dock.$post({ ...at(id), json: {} })),
    startLoading: (id: string) => call<YardTruck>(b.loading.$post({ ...at(id), json: {} })),
    complete: (id: string, actualLoadUnits: number, discrepancyNote: string | undefined) =>
      call<YardTruck>(
        b.complete.$post({
          ...at(id),
          json: discrepancyNote ? { actualLoadUnits, discrepancyNote } : { actualLoadUnits },
        }),
      ),
  };
};
