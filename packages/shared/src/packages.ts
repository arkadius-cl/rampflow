import type { PackageValues } from './registry.ts';

export const PACKAGE_IDS = ['start', 'pro', 'enterprise'] as const;
export type PackageId = (typeof PACKAGE_IDS)[number];

const start = {
  'core.max_sites': 1,
  'core.max_docks': 10,
  'core.max_internal_users': 10,
  'booking.max_bookings_per_month': 1500,
  'safety.max_briefing_templates': 2,
  'booking.carrier_portal': true,
  'booking.public_link': true,
  'booking.pools': true,
  'booking.duration_rules': true,
  'avis.basic': true,
  'yard.checkin_qr': true,
  'yard.call_to_dock': true,
  'safety.briefings': true,
  'safety.validity': true,
  'notify.email': true,
  'notify.reminders': true,
  'report.basic': true,
  'report.export': true,
  'brand.logo': true,
} as const satisfies PackageValues;

const pro = {
  ...start,
  'core.max_sites': 5,
  'core.max_docks': 60,
  'core.max_internal_users': 75,
  'booking.max_bookings_per_month': 10000,
  'safety.max_briefing_templates': 20,
  'safety.quiz': true,
  'safety.gate_enforcement': true,
} as const satisfies PackageValues;

const enterprise = {
  ...pro,
  'core.max_sites': null,
  'core.max_docks': null,
  'core.max_internal_users': null,
  'booking.max_bookings_per_month': null,
  'safety.max_briefing_templates': null,
} as const satisfies PackageValues;

export const packages: { readonly [P in PackageId]: PackageValues } = { start, pro, enterprise };
