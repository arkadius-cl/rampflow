import * as z from 'zod';
import { defineModule } from '../../contract/module.ts';

const PTS = ['platform', 'tenant', 'site'] as const;

export const booking = defineModule({
  id: 'booking',
  dependsOn: ['core'],
  enabledBy: null,
  locales: 'staff',
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
    'booking.view': { roles: ['gate_operator', 'dock_operator', 'carrier_user'] },
    'booking.book': { roles: ['carrier_user'] },
    'booking.staff_book': { roles: ['dispatcher'] },
    'booking.walk_in': { roles: ['gate_operator'] },
    'booking.force': { roles: ['dispatcher'] },
    'booking.view_actors': { roles: ['tenant_admin'] },
    'booking.manage_resources': { roles: ['tenant_admin'] },
    'booking.manage_carriers': { roles: ['dispatcher'] },
  },
  settings: {
    'booking.slot_grid_minutes': {
      schema: z.literal([5, 10, 15, 20, 30, 60]),
      default: 30,
      scopes: PTS,
    },
    'booking.min_lead_minutes': { schema: z.int().min(0).max(10080), default: 120, scopes: PTS },
    'booking.horizon_days': { schema: z.int().min(1).max(365), default: 30, scopes: PTS },
    'booking.cancel_cutoff_minutes': {
      schema: z.int().min(0).max(10080),
      default: 120,
      scopes: PTS,
    },
    'booking.close_on_public_holidays': { schema: z.boolean(), default: true, scopes: PTS },
    'booking.require_plate': { schema: z.boolean(), default: false, scopes: PTS },
    'booking.public_link_enabled': {
      schema: z.boolean(),
      default: false,
      scopes: ['site'],
      requires: 'booking.public_link',
    },
    'booking.public_registration_mode': {
      schema: z.enum(['auto_approve', 'approval_required']),
      default: 'approval_required',
      scopes: ['tenant', 'site'],
      requires: 'booking.public_link',
    },
  },
  nav: [
    {
      id: 'plan',
      area: 'tenant',
      to: '/t/$orgId/plan',
      icon: 'calendar-range',
      permission: 'booking.view',
    },
    {
      id: 'resources',
      area: 'tenant',
      to: '/t/$orgId/resources',
      icon: 'layout-grid',
      permission: 'booking.manage_resources',
    },
    {
      id: 'carriers',
      area: 'tenant',
      to: '/t/$orgId/carriers',
      icon: 'truck',
      permission: 'booking.manage_carriers',
    },
    {
      id: 'bookings',
      area: 'carrier',
      to: '/c/$orgId/bookings',
      icon: 'list',
      permission: 'booking.view',
    },
    {
      id: 'book',
      area: 'carrier',
      to: '/c/$orgId/book',
      icon: 'calendar-plus',
      permission: 'booking.book',
    },
  ],
});
