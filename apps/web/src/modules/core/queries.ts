import type { ListStateOf } from '@rampflow/shared/contract/list';
import {
  type PackageList,
  type TenantDetail,
  type TenantList,
  TenantListQuery,
} from '@rampflow/shared/modules/core/api.platform';
import type { SettingsView } from '@rampflow/shared/modules/core/api.settings';
import type { CarrierUserList, StaffList } from '@rampflow/shared/modules/core/api.staff';
import { OrgKind } from '@rampflow/shared/values';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { api, call } from '@/lib/api';

// Query options of the core administration screens (U3). Keys follow lib/query-keys.ts.

export const platformKeys = {
  /** Every page of the tenant list, whatever its query: the prefix mutations invalidate. */
  tenantLists: () => [OrgKind.platform, 'tenants', 'list'] as const,
  tenant: (tenantId: string) => [OrgKind.platform, 'tenants', tenantId] as const,
  packages: () => [OrgKind.platform, 'packages'] as const,
  settings: () => [OrgKind.platform, 'settings'] as const,
};

/** One page of the tenant list; the previous page stays visible while the next one loads. */
export const tenantListQuery = (state: ListStateOf<typeof TenantListQuery>) => {
  const query = TenantListQuery.toQuery(state);
  return queryOptions({
    queryKey: [...platformKeys.tenantLists(), query] as const,
    queryFn: () => call<TenantList>(api.platform.tenants.$get({ query })),
    placeholderData: keepPreviousData,
  });
};

export const tenantQuery = (tenantId: string) =>
  queryOptions({
    queryKey: platformKeys.tenant(tenantId),
    queryFn: () =>
      call<TenantDetail>(api.platform.tenants[':tenantId'].$get({ param: { tenantId } })),
  });

export const packagesQuery = queryOptions({
  queryKey: platformKeys.packages(),
  queryFn: () => call<PackageList>(api.platform.packages.$get()),
  staleTime: Number.POSITIVE_INFINITY,
});

export const platformSettingsQuery = queryOptions({
  queryKey: platformKeys.settings(),
  queryFn: () => call<SettingsView>(api.platform.settings.$get()),
});

export const staffKey = (orgId: string) => ['tenant', orgId, 'core', 'staff'] as const;

export const staffQuery = (orgId: string) =>
  queryOptions({
    queryKey: staffKey(orgId),
    queryFn: () => call<StaffList>(api.t[':orgId'].staff.$get({ param: { orgId } })),
  });

export const carrierUsersKey = (orgId: string) => ['carrier', orgId, 'core', 'users'] as const;

export const carrierUsersQuery = (orgId: string) =>
  queryOptions({
    queryKey: carrierUsersKey(orgId),
    queryFn: () => call<CarrierUserList>(api.c[':orgId'].users.$get({ param: { orgId } })),
  });

/** `siteId` null is the tenant level. */
export const tenantSettingsQuery = (orgId: string, siteId: string | null) =>
  queryOptions({
    queryKey: ['tenant', orgId, 'core', 'settings', siteId ?? 'tenant'] as const,
    queryFn: () =>
      call<SettingsView>(
        api.t[':orgId'].settings.$get({
          param: { orgId },
          query: siteId ? { siteId } : {},
        }),
      ),
  });
