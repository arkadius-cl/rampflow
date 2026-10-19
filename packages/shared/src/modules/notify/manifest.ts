import * as z from 'zod';
import { defineModule } from '../../contract/module.ts';

export const notify = defineModule({
  id: 'notify',
  dependsOn: ['booking'],
  enabledBy: 'notify.email',
  locales: 'staff',
  entitlements: {
    'notify.email': { kind: 'feature' },
    'notify.reminders': { kind: 'feature' },
    'notify.sms': { kind: 'feature', reserved: true },
    'notify.max_sms_per_month': { kind: 'limit', soft: true, reserved: true },
  },
  permissions: {},
  settings: {
    'notify.reminder_hours_before': {
      schema: z.int().min(1).max(72),
      default: 24,
      scopes: ['platform', 'tenant', 'site'],
      requires: 'notify.reminders',
    },
  },
  nav: [],
});
