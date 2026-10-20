import * as z from 'zod';
import { defineModule } from '../../contract/module.ts';
import { everyScope } from '../../values/settings.ts';

export const safety = defineModule({
  id: 'safety',
  dependsOn: ['booking'],
  enabledBy: 'safety.briefings',
  locales: 'staff',
  entitlements: {
    'safety.briefings': { kind: 'feature' },
    'safety.validity': { kind: 'feature' },
    'safety.quiz': { kind: 'feature' },
    'safety.gate_enforcement': { kind: 'feature' },
    'safety.max_briefing_templates': { kind: 'limit' },
    'safety.media': { kind: 'feature', reserved: true },
  },
  permissions: {
    'safety.manage_briefings': { roles: ['tenant_admin'] },
    'safety.view_register': { roles: ['dispatcher'] },
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
      scopes: ['platform', 'tenant'],
      requires: 'safety.quiz',
    },
  },
  nav: [
    {
      id: 'briefings',
      area: 'tenant',
      to: '/t/$orgId/safety/briefings',
      icon: 'shield-check',
      permission: 'safety.manage_briefings',
    },
    {
      id: 'acknowledgements',
      area: 'tenant',
      to: '/t/$orgId/safety/acknowledgements',
      icon: 'clipboard-check',
      permission: 'safety.view_register',
    },
  ],
});
