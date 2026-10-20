import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { type AnyModuleManifest, catalog } from '@rampflow/shared';
import {
  ConflictReason,
  DriverLocale,
  EntitlementKind,
  LocaleSet,
  OrgKind,
  StaffLocale,
  values,
} from '@rampflow/shared/values';
import { afterEach, describe, expect, it } from 'vitest';
import { checkCatalogs, formatProblem, readCatalogs } from './check.ts';
import { createServerI18n, LOCALES_DIR } from './server.ts';

describe('catalog check', () => {
  it('passes on the shipped catalogs', () => {
    const problems = checkCatalogs(LOCALES_DIR, catalog, { requireDerivedParts: true });
    expect(problems.map(formatProblem)).toEqual([]);
  });

  describe('on a fixture', () => {
    let dir = '';
    const write = (path: string, content: unknown) => {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), JSON.stringify(content));
    };
    const yard: AnyModuleManifest = {
      id: 'yard',
      dependsOn: [],
      enabledBy: null,
      locales: LocaleSet.staff,
      entitlements: {
        'yard.checkin_qr': { kind: EntitlementKind.feature },
        'yard.map': { kind: EntitlementKind.feature, reserved: true },
      },
      permissions: {},
      settings: {},
      nav: [
        {
          id: 'gate',
          area: OrgKind.tenant,
          to: '/t/$orgId/gate',
          icon: 'door-open',
          permission: 'yard.gate',
        },
      ],
    };
    const status = Object.fromEntries(values(DriverLocale).map((l) => [l, 'machine']));

    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    const fixture = (gate: Record<string, unknown>) => {
      dir = mkdtempSync(join(tmpdir(), 'i18n-'));
      write('status.json', status);
      write('en/yard/gate.json', {
        title: 'Gate',
        arrivals_one: '{{count}} arrival',
        arrivals_other: '{{count}} arrivals',
      });
      write('de/yard/gate.json', {
        title: 'Tor',
        arrivals_one: '{{count}} Ankunft',
        arrivals_other: '{{count}} Ankünfte',
      });
      write('pl/yard/gate.json', gate);
      return checkCatalogs(dir, [yard], { requireDerivedParts: false }).map(formatProblem);
    };

    it('accepts complete locales with language-specific plural forms', () => {
      expect(
        fixture({
          title: 'Brama',
          arrivals_one: 'a',
          arrivals_few: 'b',
          arrivals_many: 'c',
          arrivals_other: 'd',
        }),
      ).toEqual([]);
    });

    it('fails on a key missing in one locale', () => {
      expect(fixture({ title: 'Brama' })).toEqual(['pl/yard/gate.json: missing key arrivals']);
    });

    it('fails on an empty value and a part missing in one locale', () => {
      dir = mkdtempSync(join(tmpdir(), 'i18n-'));
      write('status.json', status);
      write('en/yard/gate.json', { title: 'Gate' });
      write('de/yard/gate.json', { title: ' ' });
      expect(checkCatalogs(dir, [yard], { requireDerivedParts: false }).map(formatProblem)).toEqual(
        ['de/yard/gate.json: empty value title', 'pl/yard/gate.json: missing part'],
      );
    });

    it('fails on a missing derived key and a driver locale without status', () => {
      dir = mkdtempSync(join(tmpdir(), 'i18n-'));
      write('status.json', { ...status, tr: undefined });
      for (const l of ['en', 'de', 'pl']) write(`${l}/yard/nav.json`, { docks: 'x' });
      expect(checkCatalogs(dir, [yard], { requireDerivedParts: true }).map(formatProblem)).toEqual([
        'yard/module.json: missing derived part',
        'yard/nav.json: missing derived key gate',
        'yard/entitlements.json: missing derived part',
        'status.json has no source, machine or reviewed entry for tr',
      ]);
    });
  });
});

describe('conflict reasons', () => {
  const catalogs = readCatalogs(LOCALES_DIR);
  const missing = (reasons: readonly string[]) =>
    values(StaffLocale).flatMap((locale) => {
      const errors = catalogs.get(locale)?.get('core')?.get('errors');
      return reasons
        .filter((reason) => !errors?.has(`conflict.${reason}`))
        .map((reason) => `${locale}/core/errors.json: conflict.${reason}`);
    });

  it('each have core:errors.conflict.<reason> in every staff locale', () => {
    expect(missing(values(ConflictReason))).toEqual([]);
  });

  it('name the reason and the locale of a missing string', () => {
    expect(missing(['dock_needs_resource'])).toEqual([
      'de/core/errors.json: conflict.dock_needs_resource',
      'en/core/errors.json: conflict.dock_needs_resource',
      'pl/core/errors.json: conflict.dock_needs_resource',
    ]);
  });
});

describe('createServerI18n', () => {
  it('falls back to the key for a missing string instead of throwing', async () => {
    const i18n = await createServerI18n('pl');
    expect(i18n.language).toBe('pl');
    expect(i18n.t('core:nothing.here')).toBe('nothing.here');
  });
});
