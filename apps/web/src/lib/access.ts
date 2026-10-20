import {
  catalog,
  type ImplementedFeatureKey,
  navFor,
  type PermissionKey,
  type SettingKey,
  type SettingValue,
  type VisibleNavItem,
} from '@rampflow/shared';
import type { MeResponse } from '@rampflow/shared/modules/core/api.auth';
import type {
  CarrierContext,
  PlatformContext,
  TenantContext,
} from '@rampflow/shared/modules/core/api.context';
import type { UiPrefKey, UiPrefs } from '@rampflow/shared/modules/core/ui-prefs';
import { ErrorCode, OrgKind } from '@rampflow/shared/values';
import {
  type QueryClient,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { redirect, useRouteContext } from '@tanstack/react-router';
import { api, call, isFailure } from './api';
import { queryKeys } from './query-keys';

// Who is signed in and what they may do in the current org (ADR-0011, "Context and gating").
// Each area layout loads its context in `beforeLoad` and hands `{ access }` to its child routes;
// `guard` checks a route's keys there, `useAccess` checks an action's keys in a component.
// The UI only hides. The API enforces the same keys.

export const meQuery = queryOptions({
  queryKey: queryKeys.me(),
  queryFn: () => call<MeResponse>(api.me.$get()),
  staleTime: 60_000,
});

const UI_PREF_DEBOUNCE_MS = 400;
const pendingUiPrefs = new Map<UiPrefKey, ReturnType<typeof setTimeout>>();

/**
 * One UI preference of the signed-in user, stored on the server (ADR-0014): `[value, set]`.
 * `set` shows the value at once and sends it after 400 ms without another change to the key.
 */
export function useUiPref<K extends UiPrefKey>(key: K) {
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const save = useMutation({
    mutationFn: (uiPrefs: UiPrefs) => call<MeResponse>(api.me.$patch({ json: { uiPrefs } })),
    // The global mutation handler shows the toast; refetching drops the unsaved value.
    onError: () => queryClient.invalidateQueries({ queryKey: meQuery.queryKey }),
  });
  const set = (value: NonNullable<UiPrefs[K]>) => {
    // A refetch in flight would bring back the old value until the write lands.
    void queryClient.cancelQueries({ queryKey: meQuery.queryKey });
    queryClient.setQueryData(meQuery.queryKey, (old) =>
      old ? { ...old, uiPrefs: { ...old.uiPrefs, [key]: value } } : old,
    );
    clearTimeout(pendingUiPrefs.get(key));
    pendingUiPrefs.set(
      key,
      setTimeout(() => {
        pendingUiPrefs.delete(key);
        save.mutate({ [key]: value });
      }, UI_PREF_DEBOUNCE_MS),
    );
  };
  return [me?.uiPrefs[key], set] as const;
}

export const tenantContextQuery = (orgId: string) =>
  queryOptions({
    queryKey: queryKeys.context(OrgKind.tenant, orgId),
    queryFn: () => call<TenantContext>(api.t[':orgId'].context.$get({ param: { orgId } })),
    staleTime: 60_000,
  });

export const carrierContextQuery = (orgId: string) =>
  queryOptions({
    queryKey: queryKeys.context(OrgKind.carrier, orgId),
    queryFn: () => call<CarrierContext>(api.c[':orgId'].context.$get({ param: { orgId } })),
    staleTime: 60_000,
  });

export const platformContextQuery = queryOptions({
  queryKey: queryKeys.platformContext(),
  queryFn: () => call<PlatformContext>(api.platform.context.$get()),
  staleTime: 60_000,
});

export type AreaAccess =
  | { area: 'tenant'; orgId: string; context: TenantContext }
  | { area: 'carrier'; orgId: string; context: CarrierContext }
  | { area: 'platform'; orgId: null; context: PlatformContext };

/** The router context every area layout returns from `beforeLoad`. */
export interface AreaRouteContext {
  access: AreaAccess;
  me: MeResponse;
}

/** The signed-in user, or a redirect to /login that comes back to `href` afterwards. */
export async function requireMe(queryClient: QueryClient, href: string): Promise<MeResponse> {
  try {
    return await queryClient.ensureQueryData(meQuery);
  } catch (e) {
    if (isFailure(e, ErrorCode.unauthorized))
      throw redirect({ to: '/login', search: { redirect: href } });
    throw e;
  }
}

/** Thrown by `guard`; area layouts render the "no access" page for it. */
export class AccessDenied extends Error {
  constructor() {
    super('No access');
    this.name = 'AccessDenied';
  }
}

export interface AccessKeys {
  permission: PermissionKey;
  entitlement?: ImplementedFeatureKey;
}

const moduleOf = (key: string) => key.slice(0, key.indexOf('.'));

/** Whether the caller holds the permission and, at a tenant, the module and feature are on. */
export function allows(access: AreaAccess, keys: AccessKeys): boolean {
  if (!access.context.permissions.includes(keys.permission)) return false;
  if (access.area !== OrgKind.tenant) return true;
  const { entitlements } = access.context;
  const modulesOn: Readonly<Record<string, boolean>> = entitlements.modules;
  if (!modulesOn[moduleOf(keys.permission)]) return false;
  return keys.entitlement === undefined || entitlements.features[keys.entitlement];
}

/**
 * `beforeLoad` of a screen: renders the area's "no access" page when the permission is missing,
 * the module of the permission's prefix is off, or the entitlement is off. Use the same keys as
 * the screen's API routes.
 */
export function guard(keys: AccessKeys) {
  return ({ context }: { context: Partial<AreaRouteContext> }) => {
    if (!context.access || !allows(context.access, keys)) throw new AccessDenied();
  };
}

/** The navigation of the current area, from the manifests. */
export function navOf(access: AreaAccess): VisibleNavItem[] {
  const permissions = new Set(access.context.permissions);
  if (access.area === OrgKind.tenant) {
    return navFor(catalog, {
      area: OrgKind.tenant,
      permissions,
      entitlements: access.context.entitlements,
    });
  }
  return navFor(catalog, { area: access.area, permissions });
}

/** A nav item's path with the org filled in. */
export const navHref = (item: VisibleNavItem, orgId: string | null) =>
  orgId ? item.to.replace('$orgId', orgId) : item.to;

function useAreaAccess(): AreaAccess {
  const { access } = useRouteContext({ strict: false }) as Partial<AreaRouteContext>;
  if (!access) throw new Error('useAccess() outside an area layout');
  // Read the live query, so a refetched context (after a package change) updates actions.
  const tenant = useQuery({
    ...tenantContextQuery(access.orgId ?? ''),
    enabled: access.area === OrgKind.tenant,
  });
  const carrier = useQuery({
    ...carrierContextQuery(access.orgId ?? ''),
    enabled: access.area === OrgKind.carrier,
  });
  if (access.area === OrgKind.tenant && tenant.data) return { ...access, context: tenant.data };
  if (access.area === OrgKind.carrier && carrier.data) return { ...access, context: carrier.data };
  return access;
}

/** Gates actions inside a screen: `can(permission)`, `has(feature)`, `setting(key, siteId)`. */
export function useAccess() {
  const access = useAreaAccess();
  return {
    area: access.area,
    orgId: access.orgId,
    can: (permission: PermissionKey) => access.context.permissions.includes(permission),
    has: (feature: ImplementedFeatureKey) =>
      access.area === OrgKind.tenant && access.context.entitlements.features[feature],
    setting<K extends SettingKey>(key: K, siteId: string): SettingValue<K> {
      if (access.area !== OrgKind.tenant) throw new Error('Settings exist in the tenant area only');
      const value = access.context.settings[siteId]?.[key];
      if (!value) throw new Error(`Setting ${key} is not available at site ${siteId}`);
      return value.value as SettingValue<K>;
    },
  };
}
