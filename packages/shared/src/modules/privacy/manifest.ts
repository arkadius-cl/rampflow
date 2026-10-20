import * as z from 'zod';
import { defineModule } from '../../contract/module.ts';
import { LocaleSet } from '../../values/locales.ts';
import { OrgKind, Role } from '../../values/roles.ts';
import { SettingScope } from '../../values/settings.ts';

const days = (min: number, max: number) => z.int().min(min).max(max);

/** GDPR duties: driver data subject requests (TN-06), retention (PL-05) and the privacy notice. */
export const privacy = defineModule({
  id: 'privacy',
  dependsOn: ['core'],
  enabledBy: null,
  locales: LocaleSet.staff,
  entitlements: {},
  permissions: {
    'privacy.manage_requests': { roles: [Role.tenant_admin] },
  },
  settings: {
    'privacy.notice_url': {
      schema: z.url({ protocol: /^https?$/ }).nullable(),
      default: null,
      scopes: [SettingScope.platform, SettingScope.tenant, SettingScope.site],
    },
    'privacy.retention.driver_phone_days': {
      schema: days(1, 30),
      default: 7,
      scopes: [SettingScope.platform, SettingScope.tenant],
    },
    'privacy.retention.driver_identity_days': {
      schema: days(1, 395),
      default: 90,
      scopes: [SettingScope.platform, SettingScope.tenant],
    },
    'privacy.retention.visit_days': {
      schema: days(30, 3650),
      default: 395,
      scopes: [SettingScope.platform, SettingScope.tenant],
    },
    'privacy.retention.safety_after_expiry_days': {
      schema: days(0, 1095),
      default: 730,
      scopes: [SettingScope.platform, SettingScope.tenant],
    },
    'privacy.retention.audit_log_days': {
      schema: days(30, 730),
      default: 365,
      scopes: [SettingScope.platform, SettingScope.tenant],
    },
    'privacy.retention.driver_link_hours': {
      schema: z.int().min(1).max(168),
      default: 24,
      scopes: [SettingScope.platform],
    },
    'privacy.retention.carrier_inactive_days': {
      schema: days(365, 1095),
      default: 730,
      scopes: [SettingScope.platform],
    },
  },
  nav: [
    {
      id: 'privacy',
      area: OrgKind.tenant,
      to: '/t/$orgId/privacy',
      icon: 'user-search',
      permission: 'privacy.manage_requests',
    },
  ],
});
