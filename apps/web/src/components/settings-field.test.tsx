import type { SettingKey } from '@rampflow/shared';
import type { SettingEntry } from '@rampflow/shared/modules/core/api.settings';
import {
  Permission,
  Setting,
  SettingScope,
  SettingSource,
  SettingsTopic,
  SettingUnit,
} from '@rampflow/shared/values';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { controlOf, settingDef } from '@/modules/core/setting-control';
import { SettingInput } from '@/modules/core/setting-input';
import { originLinkFor, type SettingsLevel } from '@/modules/core/settings-levels';
import { renderRoutes } from '@/test/router';
import { type EntryOverride, settingsView } from '@/test/settings';
import { SettingField, SettingOrigin } from './settings-field';

const ORG = '00000000-0000-4000-8000-000000000001';
const SITE = '00000000-0000-4000-8000-000000000002';
const tenantAdmin = (p: string) => p === Permission.core.manage_settings;

function entryOf(
  level: SettingsLevel,
  key: SettingKey,
  override: EntryOverride = {},
): SettingEntry {
  const entry = settingsView(level.scope, { [key]: override }).items.find((i) => i.key === key);
  if (!entry) throw new Error(`${key} has no ${level.scope} level`);
  return entry;
}

function showOrigin(level: SettingsLevel, entry: SettingEntry) {
  const href = originLinkFor(level, SettingsTopic.booking, tenantAdmin);
  renderRoutes(
    {
      '/': () => (
        <SettingOrigin
          entry={entry}
          scope={level.scope}
          inheritedText={String(entry.inherited.value)}
          originLink={href}
        />
      ),
    },
    '/',
  );
}

const tenant: SettingsLevel = { scope: SettingScope.tenant, orgId: ORG };
const site: SettingsLevel = { scope: SettingScope.site, orgId: ORG, siteId: SITE };
const platform: SettingsLevel = { scope: SettingScope.platform };

describe('SettingOrigin', () => {
  it('calls a tenant value equal to the platform value set for this tenant', async () => {
    showOrigin(
      tenant,
      entryOf(tenant, Setting.booking.horizon_days, {
        value: 30,
        source: SettingSource.tenant,
        inherited: { value: 30, source: SettingSource.platform },
      }),
    );
    const origin = await screen.findByTestId('setting-origin');
    expect(origin.textContent).toBe('Set for this tenant · Inherited: 30 (From platform)');
  });

  it('reads "Product default" on the platform without a row', async () => {
    showOrigin(platform, entryOf(platform, Setting.booking.horizon_days));
    expect((await screen.findByTestId('setting-origin')).textContent).toBe('Product default');
  });

  it('links a site value from the tenant to the tenant page for a tenant admin', async () => {
    showOrigin(
      site,
      entryOf(site, Setting.booking.horizon_days, { value: 45, source: SettingSource.tenant }),
    );
    const link = await screen.findByRole('link', { name: 'From tenant' });
    expect(link.getAttribute('href')).toBe(
      `/t/${ORG}/settings/booking#${Setting.booking.horizon_days}`,
    );
  });

  it('gives a tenant admin no link to the platform', async () => {
    showOrigin(
      tenant,
      entryOf(tenant, Setting.booking.horizon_days, {
        value: 60,
        source: SettingSource.platform,
      }),
    );
    expect((await screen.findByTestId('setting-origin')).textContent).toBe('From platform');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('says a setting without a site level applies to all sites on the tenant page', async () => {
    showOrigin(tenant, entryOf(tenant, Setting.safety.quiz_pass_percent));
    expect(await screen.findByText('Applies to all sites of the tenant.')).toBeTruthy();
  });

  it('says a platform-only setting cannot be changed by tenants', async () => {
    showOrigin(platform, entryOf(platform, Setting.privacy.retention.carrier_inactive_days));
    expect(await screen.findByText('Platform only: tenants cannot change this.')).toBeTruthy();
  });

  it('adds no levels hint for a setting of every level', async () => {
    showOrigin(tenant, entryOf(tenant, Setting.booking.horizon_days));
    await screen.findByTestId('setting-origin');
    expect(screen.queryByText(/Applies to all sites|Platform only/)).toBeNull();
  });
});

describe('SettingField', () => {
  const key = Setting.booking.horizon_days;
  const url = `/t/${ORG}/settings/booking`;

  function showField() {
    const spec = controlOf(key, settingDef(key).schema);
    return renderRoutes(
      {
        '/t/$orgId/settings/$topic': () => (
          <SettingField
            settingKey={key}
            label="Booking horizon"
            description="How far ahead carriers may book."
            overridden={false}
            origin={null}
            control={
              <SettingInput
                settingKey={key}
                spec={spec}
                unit={SettingUnit.days}
                value={30}
                onChange={() => {}}
                invalid={false}
              />
            }
          />
        ),
      },
      url,
    );
  }

  it('makes the title the anchor and labels the input, without showing the key', async () => {
    showField();
    const input = await screen.findByLabelText('Booking horizon');
    expect(input.id).toBe(`input-${key}`);
    const title = document.getElementById(key);
    expect(title?.tagName).toBe('H3');
    expect(title?.tabIndex).toBe(-1);
    expect(title?.contains(document.querySelector(`label[for="input-${key}"]`))).toBe(true);
    expect(screen.queryByText(key)).toBeNull();
  });

  it('describes the input with the help text and the unit suffix', async () => {
    showField();
    const input = await screen.findByLabelText('Booking horizon');
    const described = (input.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent);
    expect(described).toEqual(['How far ahead carriers may book.', 'd']);
  });

  it('copies the absolute deep link and says so', async () => {
    const user = userEvent.setup();
    showField();
    await user.click(await screen.findByRole('button', { name: 'Copy link to “Booking horizon”' }));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}${url}#${key}`);
    expect(await screen.findByText('Link copied')).toBeTruthy();
  });
});
