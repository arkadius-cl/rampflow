import * as z from 'zod';
import { defineModule } from '../../contract/module.ts';
import { EntitlementKind } from '../../values/entitlements.ts';
import { LocaleSet } from '../../values/locales.ts';
import { OrgKind, Role } from '../../values/roles.ts';
import { everyScope, SettingScope } from '../../values/settings.ts';

export const safety = defineModule({
  id: 'safety',
  dependsOn: ['booking'],
  enabledBy: 'safety.briefings',
  locales: LocaleSet.staff,
  entitlements: {
    'safety.briefings': { kind: EntitlementKind.feature },
    'safety.validity': { kind: EntitlementKind.feature },
    'safety.quiz': { kind: EntitlementKind.feature },
    'safety.gate_enforcement': { kind: EntitlementKind.feature },
    'safety.max_briefing_templates': { kind: EntitlementKind.limit },
    'safety.media': { kind: EntitlementKind.feature, reserved: true },
  },
  permissions: {
    'safety.manage_briefings': { roles: [Role.tenant_admin] },
    'safety.view_register': { roles: [Role.dispatcher] },
  },
  settings: {
    'safety.validity_days': { schema: z.int().min(0).max(730), default: 365, scopes: everyScope },
    'safety.require_for_checkin': {
      schema: z.boolean(),
      default: true,
      scopes: everyScope,
      requires: 'safety.gate_enforcement',
    },
    'safety.quiz_pass_percent': {
      schema: z.int().min(50).max(100),
      default: 100,
      scopes: [SettingScope.platform, SettingScope.tenant],
      requires: 'safety.quiz',
    },
  },
  nav: [
    {
      id: 'briefings',
      area: OrgKind.tenant,
      to: '/t/$orgId/safety/briefings',
      icon: 'shield-check',
      permission: 'safety.manage_briefings',
    },
    {
      id: 'acknowledgements',
      area: OrgKind.tenant,
      to: '/t/$orgId/safety/acknowledgements',
      icon: 'clipboard-check',
      permission: 'safety.view_register',
    },
  ],
});
