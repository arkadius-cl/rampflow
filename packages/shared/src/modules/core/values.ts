import type { ImplementedLimitKey } from '../../registry.ts';
import type { ValueOf } from '../../values/define.ts';

export const DoorType = {
  dock_leveler: 'dock_leveler',
  ground_level: 'ground_level',
  side_loading: 'side_loading',
  yard_open: 'yard_open',
} as const;
export type DoorType = ValueOf<typeof DoorType>;

export const TemperatureZone = {
  ambient: 'ambient',
  chilled: 'chilled',
  frozen: 'frozen',
} as const;
export type TemperatureZone = ValueOf<typeof TemperatureZone>;

export const DockStatus = {
  active: 'active',
  maintenance: 'maintenance',
  inactive: 'inactive',
} as const;
export type DockStatus = ValueOf<typeof DockStatus>;

/** Docks that count toward `core.max_docks`. Only `active` docks add capacity (ADR-0004). */
export const CountedDockStatus = {
  active: DockStatus.active,
  maintenance: DockStatus.maintenance,
} as const;
export type CountedDockStatus = ValueOf<typeof CountedDockStatus>;

/** The limits a tenant's usage is measured against (PL-04). */
export const UsageKey = {
  max_sites: 'core.max_sites',
  max_docks: 'core.max_docks',
  max_internal_users: 'core.max_internal_users',
  max_bookings_per_month: 'booking.max_bookings_per_month',
} as const satisfies Record<string, ImplementedLimitKey>;
export type UsageKey = ValueOf<typeof UsageKey>;
