import { defineModule } from '../../contract/module.ts';
import { LocaleSet } from '../../values/locales.ts';
import { OrgKind, Role } from '../../values/roles.ts';

export const brand = defineModule({
  id: 'brand',
  dependsOn: ['core'],
  enabledBy: 'brand.logo',
  locales: LocaleSet.staff,
  entitlements: {
    'brand.logo': { kind: 'feature' },
    'brand.white_label': { kind: 'feature', reserved: true },
    'brand.custom_domain': { kind: 'feature', reserved: true },
  },
  permissions: {
    'brand.manage': { roles: [Role.tenant_admin] },
  },
  settings: {},
  nav: [
    {
      id: 'brand',
      area: OrgKind.tenant,
      to: '/t/$orgId/brand',
      icon: 'palette',
      permission: 'brand.manage',
    },
  ],
});
