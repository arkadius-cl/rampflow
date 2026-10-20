import { defineModule } from '../../contract/module.ts';
import { EntitlementKind } from '../../values/entitlements.ts';
import { LocaleSet } from '../../values/locales.ts';

/** Declares the reserved integration keys. No MVP code belongs to this module. */
export const integration = defineModule({
  id: 'integration',
  dependsOn: ['core'],
  enabledBy: null,
  locales: LocaleSet.staff,
  entitlements: {
    'integration.api': { kind: EntitlementKind.feature, reserved: true },
    'integration.webhooks': { kind: EntitlementKind.feature, reserved: true },
    'integration.edi': { kind: EntitlementKind.feature, reserved: true },
    'integration.max_api_calls_per_day': { kind: EntitlementKind.limit, reserved: true },
  },
  permissions: {},
  settings: {},
  nav: [],
});
