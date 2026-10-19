import { defineModule } from '../../contract/module.ts';

export const report = defineModule({
  id: 'report',
  dependsOn: ['booking', 'yard'],
  enabledBy: 'report.basic',
  locales: 'staff',
  entitlements: {
    'report.basic': { kind: 'feature' },
    'report.export': { kind: 'feature' },
    'report.carrier_scorecard': { kind: 'feature', reserved: true },
    'report.scheduled': { kind: 'feature', reserved: true },
  },
  permissions: {
    'report.view': { roles: ['dispatcher'] },
  },
  settings: {},
  nav: [
    {
      id: 'reports',
      area: 'tenant',
      to: '/t/$orgId/reports',
      icon: 'chart-column',
      permission: 'report.view',
    },
  ],
});
