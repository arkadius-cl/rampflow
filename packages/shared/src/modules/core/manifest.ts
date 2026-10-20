import { defineModule } from '../../contract/module.ts';
import { LocaleSet } from '../../values/locales.ts';
import { OrgKind, Role } from '../../values/roles.ts';

export const core = defineModule({
  id: 'core',
  dependsOn: [],
  enabledBy: null,
  locales: LocaleSet.staff,
  entitlements: {
    'core.max_sites': { kind: 'limit' },
    'core.max_docks': { kind: 'limit' },
    'core.max_internal_users': { kind: 'limit' },
    'core.sso': { kind: 'feature', reserved: true },
    'core.audit_log': { kind: 'feature', reserved: true },
  },
  permissions: {
    'core.manage_tenants': { roles: [Role.platform_admin] },
    'core.manage_platform_settings': { roles: [Role.platform_admin] },
    'core.manage_staff': { roles: [Role.tenant_admin] },
    'core.manage_settings': { roles: [Role.tenant_admin] },
    'core.manage_sites': { roles: [Role.tenant_admin] },
    'core.manage_carrier_users': { roles: [Role.carrier_admin] },
  },
  settings: {},
  nav: [
    {
      id: 'tenants',
      area: OrgKind.platform,
      to: '/platform/tenants',
      icon: 'building-2',
      permission: 'core.manage_tenants',
    },
    {
      id: 'packages',
      area: OrgKind.platform,
      to: '/platform/packages',
      icon: 'package',
      permission: 'core.manage_tenants',
    },
    {
      id: 'platform_settings',
      area: OrgKind.platform,
      to: '/platform/settings',
      icon: 'sliders-horizontal',
      permission: 'core.manage_platform_settings',
    },
    {
      id: 'sites',
      area: OrgKind.tenant,
      to: '/t/$orgId/sites',
      icon: 'warehouse',
      permission: 'core.manage_sites',
    },
    {
      id: 'staff',
      area: OrgKind.tenant,
      to: '/t/$orgId/staff',
      icon: 'users',
      permission: 'core.manage_staff',
    },
    {
      id: 'settings',
      area: OrgKind.tenant,
      to: '/t/$orgId/settings',
      icon: 'settings',
      permission: 'core.manage_settings',
    },
    {
      id: 'users',
      area: OrgKind.carrier,
      to: '/c/$orgId/users',
      icon: 'users',
      permission: 'core.manage_carrier_users',
    },
  ],
});
