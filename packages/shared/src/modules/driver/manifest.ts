import { defineModule } from '../../contract/module.ts';
import { LocaleSet } from '../../values/locales.ts';

/** The driver PWA and its token exchange. Its namespace is the only one in the 12 driver locales. */
export const driver = defineModule({
  id: LocaleSet.driver,
  dependsOn: ['booking'],
  enabledBy: null,
  locales: LocaleSet.driver,
  entitlements: {},
  permissions: {},
  settings: {},
  nav: [],
});
