import { Setting, SettingScope, SettingsTopic, StaffLocale } from '@rampflow/shared/values';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { applyLocale } from '@/lib/i18n';
import { i18n } from '@/test/render';
import { renderRoutes } from '@/test/router';
import { settingsView } from '@/test/settings';
import type { SettingsLevel } from './settings-levels';
import { SettingsSearch, SettingsTopicNav } from './settings-nav';

// PL-03, TN-02: the topic navigation and the settings search of one level.

const ORG = '00000000-0000-4000-8000-000000000001';
const tenant: SettingsLevel = { scope: SettingScope.tenant, orgId: ORG };
const platform: SettingsLevel = { scope: SettingScope.platform };

afterEach(() => applyLocale(i18n, StaffLocale.en));

/** The level's topic pages, each with the topic nav and the search, opened at `topic`. */
function openLevel(level: SettingsLevel, topic: SettingsTopic) {
  const view = settingsView(level.scope);
  const page = () => (
    <>
      <SettingsTopicNav level={level} view={view} />
      <SettingsSearch level={level} view={view} />
    </>
  );
  const base = level.scope === SettingScope.platform ? '/platform' : `/t/${ORG}`;
  return renderRoutes(
    { '/platform/settings/$topic': page, '/t/$orgId/settings/$topic': page },
    `${base}/settings/${topic}`,
  );
}

async function search(text: string) {
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('button', { name: i18n.t(($) => $['settings-ui'].search.button) }),
  );
  await user.type(await screen.findByRole('combobox'), text);
  return { user, options: () => screen.queryAllByRole('option') };
}

describe('SettingsTopicNav', () => {
  it('lists the topics as links and marks the current one', async () => {
    openLevel(tenant, SettingsTopic.yard);
    const nav = await screen.findByRole('navigation', { name: 'Settings topics' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      'General',
      'Booking',
      'Avis',
      'Safety',
      'Yard',
      'Privacy',
    ]);
    expect(within(nav).getAllByRole('link', { current: 'page' })).toEqual([
      within(nav).getByRole('link', { name: 'Yard' }),
    ]);
    expect(within(nav).getByRole('link', { name: 'Yard' }).getAttribute('href')).toBe(
      `/t/${ORG}/settings/yard`,
    );
  });
});

describe('SettingsSearch', () => {
  it('adds no heading to the page while closed, and names the open dialog', async () => {
    openLevel(tenant, SettingsTopic.booking);
    await screen.findByRole('button', { name: 'Search settings' });
    expect(screen.queryByRole('heading', { name: 'Search settings' })).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Search settings' }));
    expect(await screen.findByRole('dialog', { name: 'Search settings' })).toBeDefined();
  });

  it('finds the cancellation cutoff by "storno" and opens its deep link', async () => {
    await applyLocale(i18n, StaffLocale.de);
    const { router } = openLevel(tenant, SettingsTopic.general);
    const { user, options } = await search('storno');
    expect(options().map((o) => o.textContent)).toEqual([
      'Frist für Änderung und StornoBuchung › Buchungsregeln',
    ]);
    await user.click(options()[0] as HTMLElement);
    await waitFor(() =>
      expect(router.state.location.href).toBe(
        `/t/${ORG}/settings/booking#${Setting.booking.cancel_cutoff_minutes}`,
      ),
    );
  });

  it('finds the driver link by its key on the platform', async () => {
    openLevel(platform, SettingsTopic.general);
    const { options } = await search('driver_link_hours');
    expect(options().map((o) => o.textContent)).toEqual([
      'Driver link lifetime after departurePrivacy › Driver access',
    ]);
  });

  it('finds no countries on the tenant level, which has none', async () => {
    await applyLocale(i18n, StaffLocale.de);
    openLevel(tenant, SettingsTopic.general);
    const { options } = await search('Länder');
    expect(options()).toEqual([]);
    expect(screen.getByText('Keine Einstellung gefunden.')).toBeTruthy();
  });
});
