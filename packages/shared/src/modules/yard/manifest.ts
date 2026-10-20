import * as z from 'zod';
import { defineModule } from '../../contract/module.ts';
import { EntitlementKind } from '../../values/entitlements.ts';
import { LocaleSet } from '../../values/locales.ts';
import { OrgKind, Role } from '../../values/roles.ts';
import { everyScope } from '../../values/settings.ts';

export const yard = defineModule({
  id: 'yard',
  dependsOn: ['booking'],
  enabledBy: 'yard.checkin_qr',
  locales: LocaleSet.staff,
  entitlements: {
    'yard.checkin_qr': { kind: EntitlementKind.feature },
    'yard.call_to_dock': { kind: EntitlementKind.feature },
    'yard.checkin_kiosk': { kind: EntitlementKind.feature, reserved: true },
    'yard.board': { kind: EntitlementKind.feature, reserved: true },
    'yard.queue': { kind: EntitlementKind.feature, reserved: true },
    'yard.map': { kind: EntitlementKind.feature, reserved: true },
  },
  permissions: {
    'yard.gate': { roles: [Role.gate_operator] },
    'yard.call': { roles: [Role.gate_operator, Role.dock_operator] },
    'yard.dock': { roles: [Role.dock_operator] },
  },
  settings: {
    'yard.early_tolerance_minutes': {
      schema: z.int().min(0).max(240),
      default: 30,
      scopes: everyScope,
    },
    'yard.grace_minutes': { schema: z.int().min(0).max(240), default: 15, scopes: everyScope },
    'yard.no_show_after_minutes': {
      schema: z.int().min(15).max(1440),
      default: 60,
      scopes: everyScope,
    },
    'yard.standgeld_flag_minutes': {
      schema: z.int().min(30).max(1440),
      default: 120,
      scopes: everyScope,
    },
  },
  nav: [
    {
      id: 'gate',
      area: OrgKind.tenant,
      to: '/t/$orgId/gate',
      icon: 'door-open',
      permission: 'yard.gate',
    },
    {
      id: 'docks',
      area: OrgKind.tenant,
      to: '/t/$orgId/docks',
      icon: 'container',
      permission: 'yard.call',
      entitlement: 'yard.call_to_dock',
    },
  ],
});
