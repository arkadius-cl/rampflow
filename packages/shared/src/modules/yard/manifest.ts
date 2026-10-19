import * as z from 'zod';
import { defineModule } from '../../contract/module.ts';

const PTS = ['platform', 'tenant', 'site'] as const;

export const yard = defineModule({
  id: 'yard',
  dependsOn: ['booking'],
  enabledBy: 'yard.checkin_qr',
  locales: 'staff',
  entitlements: {
    'yard.checkin_qr': { kind: 'feature' },
    'yard.call_to_dock': { kind: 'feature' },
    'yard.checkin_kiosk': { kind: 'feature', reserved: true },
    'yard.board': { kind: 'feature', reserved: true },
    'yard.queue': { kind: 'feature', reserved: true },
    'yard.map': { kind: 'feature', reserved: true },
  },
  permissions: {
    'yard.gate': { roles: ['gate_operator'] },
    'yard.call': { roles: ['gate_operator', 'dock_operator'] },
    'yard.dock': { roles: ['dock_operator'] },
  },
  settings: {
    'yard.early_tolerance_minutes': { schema: z.int().min(0).max(240), default: 30, scopes: PTS },
    'yard.grace_minutes': { schema: z.int().min(0).max(240), default: 15, scopes: PTS },
    'yard.no_show_after_minutes': { schema: z.int().min(15).max(1440), default: 60, scopes: PTS },
    'yard.standgeld_flag_minutes': {
      schema: z.int().min(30).max(1440),
      default: 120,
      scopes: PTS,
    },
  },
  nav: [
    {
      id: 'gate',
      area: 'tenant',
      to: '/t/$orgId/gate',
      icon: 'door-open',
      permission: 'yard.gate',
    },
    {
      id: 'docks',
      area: 'tenant',
      to: '/t/$orgId/docks',
      icon: 'container',
      permission: 'yard.call',
      entitlement: 'yard.call_to_dock',
    },
  ],
});
