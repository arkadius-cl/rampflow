import * as z from 'zod';
import { defineModule } from '../../contract/module.ts';
import { EntitlementKind } from '../../values/entitlements.ts';
import { LocaleSet } from '../../values/locales.ts';
import { everyScope, SettingScope } from '../../values/settings.ts';
import { BookingChange } from '../booking/values.ts';
import { ReferenceType } from './values.ts';

export const avis = defineModule({
  id: BookingChange.avis,
  dependsOn: ['booking'],
  enabledBy: 'avis.basic',
  locales: LocaleSet.staff,
  entitlements: {
    'avis.basic': { kind: EntitlementKind.feature },
    'avis.custom_fields': { kind: EntitlementKind.feature, reserved: true },
    'avis.lines': { kind: EntitlementKind.feature, reserved: true },
    'avis.attachments': { kind: EntitlementKind.feature, reserved: true },
  },
  permissions: {},
  settings: {
    /** Every listed type must appear at least once. Empty: one reference of any type suffices. */
    'avis.required_reference_types': {
      schema: z
        .array(z.enum(ReferenceType))
        .refine((types) => new Set(types).size === types.length, 'Each type may appear once')
        .readonly(),
      default: [],
      scopes: everyScope,
    },
    'avis.unique_references': {
      schema: z.boolean(),
      default: false,
      scopes: [SettingScope.tenant, SettingScope.site],
    },
    'avis.require_gross_weight': { schema: z.boolean(), default: false, scopes: everyScope },
    'avis.require_driver_phone': { schema: z.boolean(), default: false, scopes: everyScope },
  },
  nav: [],
});
