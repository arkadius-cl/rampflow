import { OrgKind } from '@rampflow/shared/values';
import { queryOptions, useQueryClient } from '@tanstack/react-query';
import { api, call } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { onboardingKey } from '@/modules/core/queries';

// Master data of the sites screens (MD-01 to MD-05). Keys follow lib/query-keys.ts:
//   ['tenant', orgId, 'core', 'sites', ...]                     sites, halls, docks
//   ['tenant', orgId, 'booking', 'capacity', siteId, ...]       resources, hours, closures, load types
// Every write invalidates both prefixes, the tenant context (which lists the active sites and the
// tenant status) and the onboarding checklist, so a dock moved between resources shows the same
// in the dock table and the pool editor, and the first dock unlocks the gated actions at once.

const sitesKey = (orgId: string) => ['tenant', orgId, 'core', 'sites'] as const;
const capacityKey = (orgId: string, siteId: string) =>
  ['tenant', orgId, 'booking', 'capacity', siteId] as const;

export const siteQueries = {
  list: (orgId: string) =>
    queryOptions({
      queryKey: sitesKey(orgId),
      queryFn: () => call(api.t[':orgId'].sites.$get({ param: { orgId } })),
    }),
  site: (orgId: string, siteId: string) =>
    queryOptions({
      queryKey: [...sitesKey(orgId), siteId],
      queryFn: () => call(api.t[':orgId'].sites[':siteId'].$get({ param: { orgId, siteId } })),
    }),
  halls: (orgId: string, siteId: string) =>
    queryOptions({
      queryKey: [...sitesKey(orgId), siteId, 'halls'],
      queryFn: () =>
        call(api.t[':orgId'].sites[':siteId'].halls.$get({ param: { orgId, siteId } })),
    }),
  docks: (orgId: string, siteId: string) =>
    queryOptions({
      queryKey: [...sitesKey(orgId), siteId, 'docks'],
      queryFn: () =>
        call(api.t[':orgId'].sites[':siteId'].docks.$get({ param: { orgId, siteId } })),
    }),
};

export const capacityQueries = {
  resources: (orgId: string, siteId: string) =>
    queryOptions({
      queryKey: [...capacityKey(orgId, siteId), 'resources'],
      queryFn: () =>
        call(api.t[':orgId'].capacity.resources.$get({ param: { orgId }, query: { siteId } })),
    }),
  hours: (orgId: string, siteId: string) =>
    queryOptions({
      queryKey: [...capacityKey(orgId, siteId), 'hours'],
      queryFn: () =>
        call(api.t[':orgId'].capacity.hours.$get({ param: { orgId }, query: { siteId } })),
    }),
  closures: (orgId: string, siteId: string, from: string, to: string) =>
    queryOptions({
      queryKey: [...capacityKey(orgId, siteId), 'closures', from, to],
      queryFn: () =>
        call(
          api.t[':orgId'].capacity.closures.$get({ param: { orgId }, query: { siteId, from, to } }),
        ),
    }),
  loadTypes: (orgId: string, siteId: string) =>
    queryOptions({
      queryKey: [...capacityKey(orgId, siteId), 'load-types'],
      queryFn: () =>
        call(api.t[':orgId'].capacity['load-types'].$get({ param: { orgId }, query: { siteId } })),
    }),
};

/** Refetches every sites and capacity query of the org, the tenant context and the checklist. */
export function useRefreshMasterData(orgId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: sitesKey(orgId) }),
      queryClient.invalidateQueries({ queryKey: ['tenant', orgId, 'booking', 'capacity'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.context(OrgKind.tenant, orgId) }),
      queryClient.invalidateQueries({ queryKey: onboardingKey(orgId) }),
    ]);
}

/** The countries the platform admits sites in, the same for every tenant. */
export const siteCountriesQuery = queryOptions({
  queryKey: ['public', 'countries'],
  queryFn: () => call(api.public.countries.$get()),
});

/** Reference data of the holiday calendar, the same for every tenant. */
export const holidayRegionsQuery = (country: string) =>
  queryOptions({
    queryKey: ['public', 'countries', country, 'holiday-regions'],
    queryFn: () =>
      call(api.public.countries[':country']['holiday-regions'].$get({ param: { country } })),
    enabled: /^[A-Z]{2}$/.test(country),
    staleTime: Number.POSITIVE_INFINITY,
  });
