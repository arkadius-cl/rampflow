import * as z from 'zod';
import { defineModule } from '../../contract/module.ts';
import { STAFF_LOCALES } from '../../locales.ts';
import { LocaleSet } from '../../values/locales.ts';
import { SettingScope } from '../../values/settings.ts';

/** Owns the default UI language. Its namespace holds language names for the switchers. */
export const i18n = defineModule({
  id: 'i18n',
  dependsOn: ['core'],
  enabledBy: null,
  locales: LocaleSet.staff,
  entitlements: {},
  permissions: {},
  settings: {
    'i18n.default_locale': {
      schema: z.enum(STAFF_LOCALES),
      default: 'de',
      scopes: [SettingScope.platform, SettingScope.tenant, SettingScope.site],
    },
  },
  nav: [],
});
