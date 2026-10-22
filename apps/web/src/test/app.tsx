import {
  catalog,
  type PermissionKey,
  packages,
  permissionsFor,
  resolveEntitlements,
} from '@rampflow/shared';
import type { MeResponse } from '@rampflow/shared/modules/core/api.auth';
import type { PlatformContext, TenantContext } from '@rampflow/shared/modules/core/api.context';
import type { SettingsView } from '@rampflow/shared/modules/core/api.settings';
import type { SiteView } from '@rampflow/shared/modules/core/api.sites';
import { TenantStatus } from '@rampflow/shared/modules/core/values';
import {
  ErrorCode,
  OrgKind,
  PackageId,
  Role,
  SettingScope,
  StaffLocale,
} from '@rampflow/shared/values';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { vi } from 'vitest';
import { RouteError, RouteNotFound } from '@/components/app-shell/route-states';
import { routeTree } from '@/routeTree.gen';
import { i18n } from './render.tsx';
import { settingsView } from './settings.ts';

// The whole web app on a memory history, against a fake API: route tests of guards, redirects
// and "no access" run the real route tree, loaders included.

export const ORG = '00000000-0000-4000-8000-0000000000a1';
export const SITE = '00000000-0000-4000-8000-0000000000b1';
export const USER = '00000000-0000-4000-8000-0000000000c1';

/**
 * Answers of the fake API by `METHOD /path`; a function gets the request's search params. A
 * `Response` is sent as it is, anything else as a 200 JSON body.
 */
export type FakeApi = Record<string, unknown | ((search: URLSearchParams) => unknown)>;

const me = (role: Role, orgKind: OrgKind, orgId: string): MeResponse => ({
  user: { id: USER, name: 'Ada Admin', email: 'ada@example.test', locale: StaffLocale.en },
  memberships: [{ orgId, orgKind, orgName: 'Acme', role }],
  uiPrefs: {},
});

const hamburg: SiteView = {
  id: SITE,
  name: 'Hamburg DC',
  addressLine1: 'Kai 1',
  addressLine2: null,
  postalCode: '20457',
  city: 'Hamburg',
  country: 'DE',
  subdivision: null,
  timeZone: 'Europe/Berlin' as SiteView['timeZone'],
  defaultLocale: StaffLocale.de,
  phone: null,
  active: true,
};

/** The API of a platform admin with the platform settings at their defaults. */
export function platformApi(): FakeApi {
  const context: PlatformContext = {
    role: Role.platform_admin,
    permissions: [...permissionsFor(catalog, Role.platform_admin)],
  };
  return {
    'GET /api/me': me(Role.platform_admin, OrgKind.platform, ORG),
    'GET /api/platform/context': context,
    'GET /api/platform/settings': settingsView(SettingScope.platform),
  };
}

/**
 * The API of tenant "Acme" on Pro with one site, Hamburg DC, for `role`; `without` drops
 * permissions the role holds.
 */
export function tenantApi(role: Role = Role.tenant_admin, without: PermissionKey[] = []): FakeApi {
  const context: TenantContext = {
    org: { id: ORG, name: 'Acme' },
    status: TenantStatus.active,
    role,
    permissions: [...permissionsFor(catalog, role)].filter((p) => !without.includes(p)),
    entitlements: resolveEntitlements(catalog, packages[PackageId.pro], [], new Date()),
    sites: [{ id: hamburg.id, name: hamburg.name, timeZone: hamburg.timeZone }],
    settings: {},
  };
  const site: SettingsView = { ...settingsView(SettingScope.site), siteId: SITE };
  return {
    'GET /api/me': me(role, OrgKind.tenant, ORG),
    [`GET /api/t/${ORG}/context`]: context,
    [`GET /api/t/${ORG}/settings`]: (search: URLSearchParams) =>
      search.get('siteId') === SITE ? site : settingsView(SettingScope.tenant),
    [`GET /api/t/${ORG}/sites`]: { items: [hamburg], usage: { sites: 1, docks: 0 } },
    [`GET /api/t/${ORG}/sites/${SITE}`]: hamburg,
    [`GET /api/t/${ORG}/sites/${SITE}/halls`]: { items: [] },
    [`GET /api/t/${ORG}/sites/${SITE}/docks`]: { items: [] },
    [`GET /api/t/${ORG}/resources`]: { items: [] },
    [`GET /api/t/${ORG}/load-types`]: { items: [] },
  };
}

/** Renders the app at `url`. A request the fake API lacks answers 404, as a foreign id would. */
export function renderApp(url: string, fake: FakeApi) {
  const requests: string[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = new URL(input instanceof Request ? input.url : String(input), 'http://app.test');
    const key = `${init?.method ?? 'GET'} ${target.pathname}`;
    requests.push(key);
    if (!(key in fake)) {
      return Response.json({ error: { code: ErrorCode.not_found, message: key } }, { status: 404 });
    }
    const answer = fake[key];
    const value = typeof answer === 'function' ? answer(target.searchParams) : answer;
    return value instanceof Response ? value : Response.json(value);
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [url] }),
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: RouteNotFound,
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { router, requests, ...view };
}
