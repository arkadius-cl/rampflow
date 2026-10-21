import * as z from 'zod';
import { defineModule } from '../../contract/module.ts';
import { LocaleSet, StaffLocale } from '../../values/locales.ts';
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
      schema: z.enum(StaffLocale),
      default: 'de',
      scopes: [SettingScope.platform, SettingScope.tenant],
    },
  },
  nav: [],
});
