import * as z from 'zod';
import { defineModule } from '../../contract/module.ts';
import { EntitlementKind } from '../../values/entitlements.ts';
import { LocaleSet } from '../../values/locales.ts';
import { SettingScope } from '../../values/settings.ts';

export const notify = defineModule({
  id: 'notify',
  dependsOn: ['booking'],
  enabledBy: 'notify.email',
  locales: LocaleSet.staff,
  entitlements: {
    'notify.email': { kind: EntitlementKind.feature },
    'notify.reminders': { kind: EntitlementKind.feature },
    'notify.sms': { kind: EntitlementKind.feature, reserved: true },
    'notify.max_sms_per_month': { kind: EntitlementKind.limit, soft: true, reserved: true },
  },
  permissions: {},
  settings: {
    'notify.reminder_hours_before': {
      schema: z.int().min(1).max(72),
      default: 24,
      scopes: [SettingScope.platform, SettingScope.tenant, SettingScope.site],
      requires: 'notify.reminders',
    },
  },
  nav: [],
});
