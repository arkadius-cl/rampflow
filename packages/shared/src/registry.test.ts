import { describe, expect, it } from 'vitest';
import { navFor, permissionsFor } from './contract/access.ts';
import { resolveEntitlements } from './contract/entitlements.ts';
import type { AnyModuleManifest } from './contract/module.ts';
import { validateCatalog } from './contract/validate.ts';
import { booking } from './modules/booking/manifest.ts';
import { core } from './modules/core/manifest.ts';
import { packages } from './packages.ts';
import { catalog } from './registry.ts';

const now = new Date('2026-10-19T08:00:00Z');

describe('catalog', () => {
  it('has no structural problems, and packages use only known implemented keys', () => {
    expect(validateCatalog(catalog, packages)).toEqual([]);
  });

  it('reports unknown, reserved and mistyped keys in a package', () => {
    const problems = validateCatalog(catalog, {
      broken: { 'booking.guest_link': true, 'booking.teleport': true, 'core.max_sites': '5' },
    });
    expect(problems).toEqual([
      'package broken: reserved entitlement booking.guest_link',
      'package broken: unknown entitlement booking.teleport',
      'package broken: core.max_sites has an invalid value',
    ]);
  });

  it('reports a dependency listed later, bad references and a default outside its schema', () => {
    const broken: AnyModuleManifest = {
      ...booking,
      id: 'extra',
      dependsOn: ['later'],
      enabledBy: 'extra.later',
      entitlements: { 'extra.later': { kind: 'feature', reserved: true } },
      permissions: { 'extra.view': { roles: ['carrier_user'] } },
      settings: {
        'extra.size': { ...booking.settings['booking.horizon_days'], default: 0, requires: 'x.y' },
      },
      nav: [{ id: 'list', area: 'tenant', to: '/', icon: 'list', permission: 'extra.view' }],
    };
    expect(validateCatalog([core, broken], {})).toEqual([
      'module extra: depends on later, which is not listed before it',
      'module extra enabledBy: reserved entitlement extra.later',
      'setting extra.size requires: unknown entitlement x.y',
      'setting extra.size: default does not match its schema',
      'nav extra.list: no tenant role holds extra.view',
    ]);
  });
});

describe('permissions', () => {
  it('grants higher roles everything their included roles hold', () => {
    const admin = permissionsFor(catalog, 'tenant_admin');
    for (const key of permissionsFor(catalog, 'dispatcher')) expect(admin.has(key)).toBe(true);
    const dispatcher = permissionsFor(catalog, 'dispatcher');
    expect(dispatcher.has('yard.gate') && dispatcher.has('yard.dock')).toBe(true);
    expect(permissionsFor(catalog, 'carrier_admin').has('booking.book')).toBe(true);
  });

  it('keeps narrow roles narrow', () => {
    const gate = permissionsFor(catalog, 'gate_operator');
    expect(gate.has('booking.staff_book')).toBe(false);
    expect(gate.has('yard.dock')).toBe(false);
    expect(permissionsFor(catalog, 'carrier_user').has('core.manage_carrier_users')).toBe(false);
    expect(permissionsFor(catalog, 'dispatcher').has('booking.view_actors')).toBe(false);
  });
});

describe('navFor', () => {
  const ids = (items: { module: string; id: string }[]) => items.map((i) => `${i.module}.${i.id}`);

  it('shows a gate operator only the screens their permissions and entitlements open', () => {
    const permissions = permissionsFor(catalog, 'gate_operator');
    const start = resolveEntitlements(catalog, packages.start, [], now);
    expect(ids(navFor(catalog, { area: 'tenant', permissions, entitlements: start }))).toEqual([
      'booking.plan',
      'yard.gate',
      'yard.docks',
    ]);
    const noCall = resolveEntitlements(
      catalog,
      packages.start,
      [{ key: 'yard.call_to_dock', value: false, expiresAt: null }],
      now,
    );
    expect(ids(navFor(catalog, { area: 'tenant', permissions, entitlements: noCall }))).toEqual([
      'booking.plan',
      'yard.gate',
    ]);
  });

  it('hides every item of a module that is off', () => {
    const permissions = permissionsFor(catalog, 'tenant_admin');
    const noYard = resolveEntitlements(
      catalog,
      packages.pro,
      [{ key: 'yard.checkin_qr', value: false, expiresAt: null }],
      now,
    );
    const visible = ids(navFor(catalog, { area: 'tenant', permissions, entitlements: noYard }));
    expect(visible).not.toContain('yard.gate');
    expect(visible).not.toContain('report.reports');
    expect(visible).toContain('safety.briefings');
  });

  it('shows carrier users their portal and carrier admins their users too', () => {
    const user = navFor(catalog, {
      area: 'carrier',
      permissions: permissionsFor(catalog, 'carrier_user'),
    });
    expect(ids(user)).toEqual(['booking.bookings', 'booking.book']);
    const admin = navFor(catalog, {
      area: 'carrier',
      permissions: permissionsFor(catalog, 'carrier_admin'),
    });
    expect(ids(admin)).toEqual(['core.users', 'booking.bookings', 'booking.book']);
  });
});
