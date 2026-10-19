import { defineModule } from '../../contract/module.ts';

/** The driver PWA and its token exchange. Its namespace is the only one in the 12 driver locales. */
export const driver = defineModule({
  id: 'driver',
  dependsOn: ['booking'],
  enabledBy: null,
  locales: 'driver',
  entitlements: {},
  permissions: {},
  settings: {},
  nav: [],
});
