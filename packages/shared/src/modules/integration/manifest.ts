import { defineModule } from '../../contract/module.ts';

/** Declares the reserved integration keys. No MVP code belongs to this module. */
export const integration = defineModule({
  id: 'integration',
  dependsOn: ['core'],
  enabledBy: null,
  locales: 'staff',
  entitlements: {
    'integration.api': { kind: 'feature', reserved: true },
    'integration.webhooks': { kind: 'feature', reserved: true },
    'integration.edi': { kind: 'feature', reserved: true },
    'integration.max_api_calls_per_day': { kind: 'limit', reserved: true },
  },
  permissions: {},
  settings: {},
  nav: [],
});
