import * as z from 'zod';
import { defineModule } from '../../contract/module.ts';
import { values } from '../../values/define.ts';
import { everyScope } from '../../values/settings.ts';
import { ReferenceType } from './values.ts';

export { ReferenceType };
export const REFERENCE_TYPES = values(ReferenceType);

export const avis = defineModule({
  id: 'avis',
  dependsOn: ['booking'],
  enabledBy: 'avis.basic',
  locales: 'staff',
  entitlements: {
    'avis.basic': { kind: 'feature' },
    'avis.custom_fields': { kind: 'feature', reserved: true },
    'avis.lines': { kind: 'feature', reserved: true },
    'avis.attachments': { kind: 'feature', reserved: true },
  },
  permissions: {},
  settings: {
    /** Every listed type must appear at least once. Empty: one reference of any type suffices. */
    'avis.required_reference_types': {
      schema: z
        .array(z.enum(REFERENCE_TYPES))
        .refine((types) => new Set(types).size === types.length, 'Each type may appear once')
        .readonly(),
      default: [],
      scopes: everyScope,
    },
    'avis.unique_references': { schema: z.boolean(), default: false, scopes: ['tenant', 'site'] },
    'avis.require_gross_weight': { schema: z.boolean(), default: false, scopes: everyScope },
    'avis.require_driver_phone': { schema: z.boolean(), default: false, scopes: everyScope },
  },
  nav: [],
});
