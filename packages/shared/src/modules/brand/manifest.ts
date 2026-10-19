import { defineModule } from '../../contract/module.ts';

export const brand = defineModule({
  id: 'brand',
  dependsOn: ['core'],
  enabledBy: 'brand.logo',
  locales: 'staff',
  entitlements: {
    'brand.logo': { kind: 'feature' },
    'brand.white_label': { kind: 'feature', reserved: true },
    'brand.custom_domain': { kind: 'feature', reserved: true },
  },
  permissions: {
    'brand.manage': { roles: ['tenant_admin'] },
  },
  settings: {},
  nav: [
    {
      id: 'brand',
      area: 'tenant',
      to: '/t/$orgId/brand',
      icon: 'palette',
      permission: 'brand.manage',
    },
  ],
});
