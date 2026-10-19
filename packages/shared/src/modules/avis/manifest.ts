import * as z from 'zod';
import { defineModule } from '../../contract/module.ts';

/** Reference kinds from domain research §1. */
export const REFERENCE_TYPES = [
  'purchase_order',
  'delivery_note',
  'shipment',
  'transport_order',
  'customer_ref',
  'container',
  'other',
] as const;

const PTS = ['platform', 'tenant', 'site'] as const;

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
    'avis.required_reference_types': {
      schema: z
        .array(z.enum(REFERENCE_TYPES))
        .refine((types) => new Set(types).size === types.length, 'Each type may appear once')
        .readonly(),
      default: [],
      scopes: PTS,
    },
    'avis.unique_references': { schema: z.boolean(), default: false, scopes: ['tenant', 'site'] },
    'avis.require_gross_weight': { schema: z.boolean(), default: false, scopes: PTS },
    'avis.require_driver_phone': { schema: z.boolean(), default: false, scopes: PTS },
  },
  nav: [],
});
