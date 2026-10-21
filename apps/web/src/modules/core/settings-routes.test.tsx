import { Permission, Role } from '@rampflow/shared/values';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ORG, platformApi, renderApp, SITE, tenantApi } from '@/test/app';

// PL-03, TN-02, MD-01: the settings routes of the three levels, on the real route tree.

afterEach(() => vi.unstubAllGlobals());

const FOREIGN_SITE = '00000000-0000-4000-8000-0000000000f1';

async function landsOn(router: ReturnType<typeof renderApp>['router'], pathname: string) {
  await waitFor(() => expect(router.state.location.pathname).toBe(pathname));
  await waitFor(() => expect(router.state.status).toBe('idle'));
}

const topicLink = async (name: string) =>
  within(await screen.findByRole('navigation', { name: 'Settings topics' })).queryByRole('link', {
    name,
  });

const noAccess = () => screen.findByText('No access');
const form = () => screen.queryByRole('button', { name: 'Save' });

describe('PL-03 platform settings routes', () => {
  it('replaces /platform/settings with the first topic', async () => {
    const { router } = renderApp('/platform/settings', platformApi());
    await landsOn(router, '/platform/settings/general');
    expect(router.history.length).toBe(1);
    expect(await topicLink('General')).toHaveProperty('ariaCurrent', 'page');
  });

  it('shows no access for an unknown topic', async () => {
    renderApp('/platform/settings/billing', platformApi());
    await noAccess();
    expect(form()).toBeNull();
  });
});

describe('TN-02 tenant settings routes', () => {
  it('replaces /t/$orgId/settings with the first topic', async () => {
    const { router } = renderApp(`/t/${ORG}/settings`, tenantApi());
    await landsOn(router, `/t/${ORG}/settings/general`);
    expect(router.history.length).toBe(1);
    await screen.findByRole('button', { name: 'Save' });
  });

  it('sends ?site= of a known site to its Settings tab', async () => {
    const { router } = renderApp(`/t/${ORG}/settings?site=${SITE}`, tenantApi());
    await landsOn(router, `/t/${ORG}/sites/${SITE}/settings/booking`);
    expect(router.history.length).toBe(1);
  });

  it('shows no access for ?site= of another tenant, without the tenant level', async () => {
    const { router } = renderApp(`/t/${ORG}/settings?site=${FOREIGN_SITE}`, tenantApi());
    await noAccess();
    expect(router.state.location.pathname).toBe(`/t/${ORG}/settings`);
    expect(form()).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Settings topics' })).toBeNull();
    // The parent route preloads the tenant view; none of its fields may render.
    expect(document.querySelector('[data-setting]')).toBeNull();
  });
});

describe('MD-01 site settings routes', () => {
  it('replaces the site settings root with the booking topic', async () => {
    const { router } = renderApp(`/t/${ORG}/sites/${SITE}/settings`, tenantApi());
    await landsOn(router, `/t/${ORG}/sites/${SITE}/settings/booking`);
    expect(router.history.length).toBe(1);
    expect(await topicLink('Booking')).toHaveProperty('ariaCurrent', 'page');
    expect(await topicLink('General')).toBeNull();
  });

  it('shows no access for the general topic, which has no site level', async () => {
    renderApp(`/t/${ORG}/sites/${SITE}/settings/general`, tenantApi());
    await noAccess();
    expect(form()).toBeNull();
  });

  it('ends the site tabs with Settings for a settings admin only', async () => {
    renderApp(`/t/${ORG}/sites/${SITE}`, tenantApi());
    const tabs = await screen.findByRole('navigation', { name: 'Site sections' });
    const links = [...tabs.querySelectorAll('a')];
    expect(links.at(-1)?.textContent).toBe('Settings');
    expect(links.at(-1)?.getAttribute('href')).toBe(`/t/${ORG}/sites/${SITE}/settings`);
  });

  it('shows no Settings tab without core.manage_settings', async () => {
    renderApp(
      `/t/${ORG}/sites/${SITE}`,
      tenantApi(Role.tenant_admin, [Permission.core.manage_settings]),
    );
    const tabs = await screen.findByRole('navigation', { name: 'Site sections' });
    expect([...tabs.querySelectorAll('a')].map((a) => a.textContent)).not.toContain('Settings');
  });
});
