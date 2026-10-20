import { defineModule } from '../../contract/module.ts';
import { EntitlementKind } from '../../values/entitlements.ts';
import { LocaleSet } from '../../values/locales.ts';
import { OrgKind, Role } from '../../values/roles.ts';

export const report = defineModule({
  id: 'report',
  dependsOn: ['booking', 'yard'],
  enabledBy: 'report.basic',
  locales: LocaleSet.staff,
  entitlements: {
    'report.basic': { kind: EntitlementKind.feature },
    'report.export': { kind: EntitlementKind.feature },
    'report.carrier_scorecard': { kind: EntitlementKind.feature, reserved: true },
    'report.scheduled': { kind: EntitlementKind.feature, reserved: true },
  },
  permissions: {
    'report.view': { roles: [Role.dispatcher] },
  },
  settings: {},
  nav: [
    {
      id: 'reports',
      area: OrgKind.tenant,
      to: '/t/$orgId/reports',
      icon: 'chart-column',
      permission: 'report.view',
    },
  ],
});
