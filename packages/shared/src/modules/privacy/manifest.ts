import * as z from 'zod';
import { defineModule } from '../../contract/module.ts';

const days = (min: number, max: number) => z.int().min(min).max(max);

/** GDPR duties: driver data subject requests (TN-06), retention (PL-05) and the privacy notice. */
export const privacy = defineModule({
  id: 'privacy',
  dependsOn: ['core'],
  enabledBy: null,
  locales: 'staff',
  entitlements: {},
  permissions: {
    'privacy.manage_requests': { roles: ['tenant_admin'] },
  },
  settings: {
    'privacy.notice_url': {
      schema: z.url({ protocol: /^https?$/ }).nullable(),
      default: null,
      scopes: ['platform', 'tenant', 'site'],
    },
    'privacy.retention.driver_phone_days': {
      schema: days(1, 30),
      default: 7,
      scopes: ['platform', 'tenant'],
    },
    'privacy.retention.driver_identity_days': {
      schema: days(1, 395),
      default: 90,
      scopes: ['platform', 'tenant'],
    },
    'privacy.retention.visit_days': {
      schema: days(30, 3650),
      default: 395,
      scopes: ['platform', 'tenant'],
    },
    'privacy.retention.safety_after_expiry_days': {
      schema: days(0, 1095),
      default: 730,
      scopes: ['platform', 'tenant'],
    },
    'privacy.retention.audit_log_days': {
      schema: days(30, 730),
      default: 365,
      scopes: ['platform', 'tenant'],
    },
    'privacy.retention.driver_link_hours': {
      schema: z.int().min(1).max(168),
      default: 24,
      scopes: ['platform'],
    },
    'privacy.retention.carrier_inactive_days': {
      schema: days(365, 1095),
      default: 730,
      scopes: ['platform'],
    },
  },
  nav: [
    {
      id: 'privacy',
      area: 'tenant',
      to: '/t/$orgId/privacy',
      icon: 'user-search',
      permission: 'privacy.manage_requests',
    },
  ],
});
