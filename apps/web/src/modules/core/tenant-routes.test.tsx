import type {
  PlatformSiteList,
  TenantDetail,
  TenantList,
  TenantSummary,
  TenantUsage,
} from '@rampflow/shared/modules/core/api.platform';
import {
  TenantListParam,
  TenantListView,
  TenantStatus,
} from '@rampflow/shared/modules/core/values';
import { ErrorCode, PackageId } from '@rampflow/shared/values';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ORG, platformApi, renderApp, tenantApi } from '@/test/app';

// PL-04, PL-06, PL-07: the tenant list's views and row actions, the hub's tabs, and the
// suspended page, on the real route tree against a fake API.

afterEach(() => vi.unstubAllGlobals());

const TENANT_A = '00000000-0000-4000-8000-0000000000d1';
const TENANT_B = '00000000-0000-4000-8000-0000000000d2';

const usage: TenantUsage = {
  'core.max_sites': { used: 1, limit: 1, soft: false, over: false },
  'core.max_docks': { used: 2, limit: 4, soft: false, over: false },
  'core.max_internal_users': { used: 3, limit: 5, soft: true, over: false },
  'booking.max_bookings_per_month': { used: 0, limit: null, soft: false, over: false },
};

const summary = (
  over: Partial<TenantSummary> & Pick<TenantSummary, 'id' | 'name'>,
): TenantSummary => ({
  package: PackageId.pro,
  createdAt: '2026-01-05T08:00:00Z',
  status: TenantStatus.active,
  country: 'DE',
  taxId: null,
  admin: null,
  lastActivityAt: null,
  possibleDuplicate: false,
  usage,
  ...over,
});

const active = summary({
  id: TENANT_A,
  name: 'Acme Logistics',
  admin: { email: 'boss@acme.test', invited: true },
});
const suspended = summary({
  id: TENANT_B,
  name: 'Rhein Lager',
  status: TenantStatus.suspended,
  country: null,
});

const list = (items: TenantSummary[]): TenantList => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 25,
  facets: {
    status: { onboarding: 0, active: 1, suspended: 1 },
    package: { start: 0, pro: 2, enterprise: 0 },
    country: { DE: 1, none: 1 } as TenantList['facets']['country'],
    flag: { possible_duplicate: 0, tax_id_unverified: 0 },
  },
  views: { attention: 1, all: 2 },
});

const detail = (row: TenantSummary): TenantDetail => ({
  ...row,
  activatedAt: '2026-01-06T08:00:00Z',
  taxId: null,
  suspension: null,
  admins: [{ id: 'u1', name: 'Mara Engel', email: 'mara@acme.test' }],
  onboarding: null,
  entitlements: [],
  overrides: [],
  adminInvitations: [],
});

const sites: PlatformSiteList = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 25,
  facets: { active: { yes: 0, no: 0 } },
};

function tenantsApi() {
  const requests: string[] = [];
  const api = {
    ...platformApi(),
    'GET /api/platform/tenants': (search: URLSearchParams) => {
      requests.push(search.toString());
      return search.get(TenantListParam.view) === TenantListView.all
        ? list([active, suspended])
        : list([suspended]);
    },
    [`GET /api/platform/tenants/${TENANT_A}`]: detail(active),
    [`GET /api/platform/tenants/${TENANT_A}/sites`]: sites,
  };
  return { api, requests };
}

describe('PL-04 tenant list views', () => {
  it('opens on "Needs attention" with the counts and switches to "All" through the URL', async () => {
    const user = userEvent.setup();
    const { api, requests } = tenantsApi();
    const { router } = renderApp('/platform/tenants', api);
    const attention = await screen.findByRole('tab', { name: /Needs attention/ });
    expect(attention).toHaveProperty('ariaSelected', 'true');
    await screen.findByText('Rhein Lager');
    expect(screen.queryByText('Acme Logistics')).toBeNull();
    expect(within(attention).getByText('1')).toBeDefined();
    expect(within(screen.getByRole('tab', { name: /All/ })).getByText('2')).toBeDefined();
    expect(requests[0]).toBe('');

    await user.click(screen.getByRole('tab', { name: /All/ }));
    await waitFor(() => expect(router.state.location.search).toEqual({ view: TenantListView.all }));
    await screen.findByText('Acme Logistics');
    expect(requests.at(-1)).toContain('view=all');
  });

  it('opens the hub on a click in a cell, but not on the actions button', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/platform/tenants?view=all', tenantsApi().api);
    const row = (await screen.findByTestId(`tenant-${TENANT_A}`)) as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Actions for Acme Logistics' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Suspend' }));
    await screen.findByRole('heading', { name: 'Suspend Acme Logistics' });
    expect(router.state.location.pathname).toBe('/platform/tenants');
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Suspend Acme Logistics' })).toBeNull(),
    );
    await user.click(within(row).getByText('Pro'));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/platform/tenants/${TENANT_A}`),
    );
  });

  it('offers "View" and "Reactivate", not "Suspend", for a suspended tenant', async () => {
    const user = userEvent.setup();
    renderApp('/platform/tenants', tenantsApi().api);
    await user.click(await screen.findByRole('button', { name: 'Actions for Rhein Lager' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'View' })).toBeDefined();
    expect(within(menu).getByRole('menuitem', { name: 'Reactivate' })).toBeDefined();
    expect(within(menu).queryByRole('menuitem', { name: 'Suspend' })).toBeNull();
  });

  it('shows "Not set", "Invited" and "Never" for the empty values', async () => {
    renderApp('/platform/tenants?view=all', tenantsApi().api);
    const row = (await screen.findByTestId(`tenant-${TENANT_A}`)) as HTMLElement;
    expect(within(row).getByText('Invited')).toBeDefined();
    expect(within(row).getByText('Never')).toBeDefined();
    const other = screen.getByTestId(`tenant-${TENANT_B}`) as HTMLElement;
    expect(within(other).getByText('Not set')).toBeDefined();
    expect(within(other).getByText('Suspended')).toBeDefined();
  });
});

describe('PL-06 tenant hub', () => {
  it('opens a deep link to the Sites tab with aria-current and the header', async () => {
    renderApp(`/platform/tenants/${TENANT_A}/sites`, tenantsApi().api);
    const tabs = await screen.findByRole('navigation', { name: 'Tenant areas' });
    expect(within(tabs).getByRole('link', { name: 'Sites' })).toHaveProperty('ariaCurrent', 'page');
    expect(within(tabs).getByRole('link', { name: 'Overview' })).toHaveProperty(
      'ariaCurrent',
      null,
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Acme Logistics' })).toBeDefined();
    await screen.findByText('This tenant has not created a site yet.');
  });

  it('shows no access for an unknown tenant', async () => {
    renderApp(`/platform/tenants/${TENANT_B}/members`, tenantsApi().api);
    await screen.findByText('No access');
    expect(screen.queryByRole('navigation', { name: 'Tenant areas' })).toBeNull();
  });

  it('turns only the master data card into a form and restores it on cancel without a request', async () => {
    const user = userEvent.setup();
    const { api } = tenantsApi();
    const { requests } = renderApp(`/platform/tenants/${TENANT_A}`, api);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const name = screen.getByLabelText('Company name') as HTMLInputElement;
    expect(name.value).toBe('Acme Logistics');
    await user.clear(name);
    await user.type(name, 'Acme Logistics GmbH');
    const sent = requests.length;
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Company name')).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDefined();
    expect(requests.length).toBe(sent);
  });
});

describe('PL-07 suspended tenant area', () => {
  it('shows the suspended page instead of the tenant area', async () => {
    const api = tenantApi();
    api[`GET /api/t/${ORG}/context`] = Response.json(
      { error: { code: ErrorCode.tenant_suspended, message: 'The organisation is suspended' } },
      { status: 403 },
    );
    renderApp(`/t/${ORG}/plan`, api);
    await screen.findByText('Organisation suspended');
    expect(screen.getByRole('link', { name: 'Go to your organisations' })).toBeDefined();
  });
});
