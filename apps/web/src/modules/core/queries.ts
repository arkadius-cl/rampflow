import type { ListStateOf } from '@rampflow/shared/contract/list';
import type { OnboardingView } from '@rampflow/shared/modules/core/api.onboarding';
import {
  type NewTenantNote,
  type PackageList,
  type PlatformMemberList,
  PlatformMemberListQuery,
  type PlatformSiteList,
  PlatformSiteListQuery,
  type SuspensionBody,
  type TenantDetail,
  type TenantList,
  TenantListQuery,
  type TenantNoteList,
  TenantNoteListQuery,
  type TenantNoteView,
} from '@rampflow/shared/modules/core/api.platform';
import type { CarrierUserList, StaffList } from '@rampflow/shared/modules/core/api.staff';
import { OrgKind } from '@rampflow/shared/values';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { api, call } from '@/lib/api';

// Query options of the core administration screens (U3). Keys follow lib/query-keys.ts.

export const platformKeys = {
  /** Every page of the tenant list, whatever its query: the prefix mutations invalidate. */
  tenantLists: () => [OrgKind.platform, 'tenants', 'list'] as const,
  tenant: (tenantId: string) => [OrgKind.platform, 'tenants', tenantId] as const,
  /** Every page of the hub's lists (PL-06, PL-08); add-note invalidates the notes prefix. */
  tenantMembers: (tenantId: string) =>
    [OrgKind.platform, 'tenants', tenantId, 'members', 'list'] as const,
  tenantSites: (tenantId: string) =>
    [OrgKind.platform, 'tenants', tenantId, 'sites', 'list'] as const,
  tenantNotes: (tenantId: string) =>
    [OrgKind.platform, 'tenants', tenantId, 'notes', 'list'] as const,
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

// The hub's lists and commands. The routes land with the API branch of change 04; until then the
// typed client lacks them, hence the directives on the path lines.

export const tenantMembersQuery = (
  tenantId: string,
  state: ListStateOf<typeof PlatformMemberListQuery>,
) => {
  const query = PlatformMemberListQuery.toQuery(state);
  return queryOptions({
    queryKey: [...platformKeys.tenantMembers(tenantId), query] as const,
    queryFn: () =>
      call<PlatformMemberList>(
        api.platform.tenants[':tenantId'].members.$get({ param: { tenantId }, query }),
      ),
    placeholderData: keepPreviousData,
  });
};

export const tenantSitesQuery = (
  tenantId: string,
  state: ListStateOf<typeof PlatformSiteListQuery>,
) => {
  const query = PlatformSiteListQuery.toQuery(state);
  return queryOptions({
    queryKey: [...platformKeys.tenantSites(tenantId), query] as const,
    queryFn: () =>
      call<PlatformSiteList>(
        api.platform.tenants[':tenantId'].sites.$get({ param: { tenantId }, query }),
      ),
    placeholderData: keepPreviousData,
  });
};

export const tenantNotesQuery = (
  tenantId: string,
  state: ListStateOf<typeof TenantNoteListQuery>,
) => {
  const query = TenantNoteListQuery.toQuery(state);
  return queryOptions({
    queryKey: [...platformKeys.tenantNotes(tenantId), query] as const,
    queryFn: () =>
      call<TenantNoteList>(
        api.platform.tenants[':tenantId'].notes.$get({ param: { tenantId }, query }),
      ),
    placeholderData: keepPreviousData,
  });
};

export const createTenantNote = (tenantId: string, json: NewTenantNote) =>
  call<TenantNoteView>(
    api.platform.tenants[':tenantId'].notes.$post({ param: { tenantId }, json }),
  );

export const suspendTenant = (tenantId: string, json: SuspensionBody) =>
  call<TenantDetail>(
    api.platform.tenants[':tenantId'].suspend.$post({ param: { tenantId }, json }),
  );

export const reactivateTenant = (tenantId: string, json: SuspensionBody) =>
  call<TenantDetail>(
    api.platform.tenants[':tenantId'].reactivate.$post({ param: { tenantId }, json }),
  );

export const packagesQuery = queryOptions({
  queryKey: platformKeys.packages(),
  queryFn: () => call<PackageList>(api.platform.packages.$get()),
  staleTime: Number.POSITIVE_INFINITY,
});

export const onboardingKey = (orgId: string) => ['tenant', orgId, 'core', 'onboarding'] as const;

/** The checklist of a tenant in onboarding (ON-01); master data writes invalidate it. */
export const onboardingQuery = (orgId: string) =>
  queryOptions({
    queryKey: onboardingKey(orgId),
    queryFn: () => call<OnboardingView>(api.t[':orgId'].onboarding.$get({ param: { orgId } })),
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
