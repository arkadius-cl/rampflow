import * as z from 'zod';
import { defineModule } from '../../contract/module.ts';
import { EmailCategory } from '../../values/emails.ts';
import { LocaleSet } from '../../values/locales.ts';
import { OrgKind, Role } from '../../values/roles.ts';
import { everyScope, SettingScope } from '../../values/settings.ts';

export const booking = defineModule({
  id: EmailCategory.booking,
  dependsOn: ['core'],
  enabledBy: null,
  locales: LocaleSet.staff,
  entitlements: {
    'booking.carrier_portal': { kind: 'feature' },
    'booking.public_link': { kind: 'feature' },
    'booking.pools': { kind: 'feature' },
    'booking.duration_rules': { kind: 'feature' },
    'booking.max_bookings_per_month': { kind: 'limit', soft: true },
    'booking.guest_link': { kind: 'feature', reserved: true },
    'booking.recurring': { kind: 'feature', reserved: true },
    'booking.carrier_quotas': { kind: 'feature', reserved: true },
    'booking.approval': { kind: 'feature', reserved: true },
    'booking.late_policy': { kind: 'feature', reserved: true },
  },
  permissions: {
    'booking.view': { roles: [Role.gate_operator, Role.dock_operator, Role.carrier_user] },
    'booking.book': { roles: [Role.carrier_user] },
    'booking.staff_book': { roles: [Role.dispatcher] },
    'booking.walk_in': { roles: [Role.gate_operator] },
    'booking.force': { roles: [Role.dispatcher] },
    'booking.view_actors': { roles: [Role.tenant_admin] },
    'booking.manage_resources': { roles: [Role.tenant_admin] },
    'booking.manage_carriers': { roles: [Role.dispatcher] },
  },
  settings: {
    'booking.slot_grid_minutes': {
      schema: z.literal([5, 10, 15, 20, 30, 60]),
      default: 30,
      scopes: everyScope,
    },
    'booking.min_lead_minutes': {
      schema: z.int().min(0).max(10080),
      default: 120,
      scopes: everyScope,
    },
    'booking.horizon_days': { schema: z.int().min(1).max(365), default: 30, scopes: everyScope },
    'booking.cancel_cutoff_minutes': {
      schema: z.int().min(0).max(10080),
      default: 120,
      scopes: everyScope,
    },
    'booking.close_on_public_holidays': { schema: z.boolean(), default: true, scopes: everyScope },
    'booking.require_plate': { schema: z.boolean(), default: false, scopes: everyScope },
    'booking.public_link_enabled': {
      schema: z.boolean(),
      default: false,
      scopes: [SettingScope.site],
      requires: 'booking.public_link',
    },
    'booking.public_registration_mode': {
      schema: z.enum(['auto_approve', 'approval_required']),
      default: 'approval_required',
      scopes: [SettingScope.tenant, SettingScope.site],
      requires: 'booking.public_link',
    },
  },
  nav: [
    {
      id: 'plan',
      area: OrgKind.tenant,
      to: '/t/$orgId/plan',
      icon: 'calendar-range',
      permission: 'booking.view',
    },
    {
      id: 'carriers',
      area: OrgKind.tenant,
      to: '/t/$orgId/carriers',
      icon: 'truck',
      permission: 'booking.manage_carriers',
    },
    {
      id: 'bookings',
      area: OrgKind.carrier,
      to: '/c/$orgId/bookings',
      icon: 'list',
      permission: 'booking.view',
    },
    {
      id: 'book',
      area: OrgKind.carrier,
      to: '/c/$orgId/book',
      icon: 'calendar-plus',
      permission: 'booking.book',
    },
    {
      id: 'tenants',
      area: OrgKind.carrier,
      to: '/c/$orgId/tenants',
      icon: 'warehouse',
      permission: 'booking.view',
    },
  ],
});
