// Compile-time guarantees of defineModule and PackageValues. `tsc -b` fails when a guard stops
// rejecting the marked line, because the @ts-expect-error directive is then unused.
import * as z from 'zod';
import type { PackageValues } from '../registry.ts';
import { EntitlementKind } from '../values/entitlements.ts';
import { OrgKind } from '../values/roles.ts';
import { SettingScope } from '../values/settings.ts';
import { defineModule } from './module.ts';

const base = { id: 'demo', dependsOn: [], locales: 'staff', settings: {}, nav: [] } as const;
const entitlements = {
  'demo.on': { kind: EntitlementKind.feature },
  'demo.later': { kind: EntitlementKind.feature, reserved: true },
  'demo.max': { kind: EntitlementKind.limit },
} as const;
const permissions = { 'demo.view': { roles: ['dispatcher'] } } as const;

export const prefix = defineModule({
  ...base,
  enabledBy: null,
  entitlements: {
    // @ts-expect-error keys carry the module id as prefix
    'other.flag': { kind: EntitlementKind.feature },
  },
  permissions: {},
});

export const enabledByReserved = defineModule({
  ...base,
  // @ts-expect-error a reserved key cannot enable a module
  enabledBy: 'demo.later',
  entitlements,
  permissions,
});

export const enabledByLimit = defineModule({
  ...base,
  // @ts-expect-error a limit cannot enable a module
  enabledBy: 'demo.max',
  entitlements,
  permissions,
});

export const badDefault = defineModule({
  ...base,
  enabledBy: null,
  entitlements,
  permissions,
  settings: {
    // @ts-expect-error the default must pass the schema's type
    'demo.grid': { schema: z.literal([5, 10]), default: 7, scopes: [SettingScope.site] },
  },
});

export const requiresReserved = defineModule({
  ...base,
  enabledBy: null,
  entitlements,
  permissions,
  settings: {
    'demo.size': {
      schema: z.int(),
      default: 3,
      scopes: [SettingScope.site],
      // @ts-expect-error a setting can only require an implemented feature of its own module
      requires: 'demo.later',
    },
  },
});

export const navPermission = defineModule({
  ...base,
  enabledBy: null,
  entitlements,
  permissions,
  // @ts-expect-error nav permissions are declared by the same module
  nav: [{ id: 'x', area: OrgKind.tenant, to: '/', icon: 'x', permission: 'demo.nope' }],
});

export const carrierNavEntitlement = defineModule({
  ...base,
  enabledBy: null,
  entitlements,
  permissions,
  nav: [
    {
      id: 'x',
      area: OrgKind.carrier,
      to: '/',
      icon: 'x',
      permission: 'demo.view',
      // @ts-expect-error carriers have no package, so carrier nav cannot require an entitlement
      entitlement: 'demo.on',
    },
  ],
});

// @ts-expect-error packages cannot grant reserved keys
export const reservedInPackage: PackageValues = { 'booking.guest_link': true };
// @ts-expect-error feature values are booleans
export const wrongKind: PackageValues = { 'booking.pools': 3 };
