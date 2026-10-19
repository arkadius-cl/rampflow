// UI-side domain vocabulary for the design prototype. The implementation
// replaces these with the exports of @rampflow/shared once they exist.

export const BOOKING_STATUSES = [
  'confirmed',
  'checked_in',
  'called',
  'at_dock',
  'loading',
  'done',
  'departed',
  'cancelled',
  'no_show',
  'turned_away',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export type SafetyStatus = 'valid' | 'missing' | 'expired' | 'invalidated';
export type Punctuality = 'early' | 'on_time' | 'late';
export type Direction = 'inbound' | 'outbound';
export type ResourceKind = 'pool' | 'single';
export type DockStatus = 'active' | 'maintenance' | 'inactive';
export type DoorType = 'dock_leveler' | 'ground_level' | 'side_loading' | 'yard_open';
export type TemperatureZone = 'ambient' | 'chilled' | 'frozen';

export type SettingSource = 'default' | 'platform' | 'tenant' | 'site';

export type EntitlementState = 'on' | 'off' | 'upsell';

export type DriverStep = 'booking' | 'briefing' | 'quiz' | 'waiting' | 'called' | 'done';

export interface Site {
  id: string;
  tenantId: string;
  name: string;
  city: string;
  address: string;
  timeZone: string;
  zoneLabel: string;
}

export interface Hall {
  id: string;
  siteId: string;
  name: string;
}

export interface Dock {
  id: string;
  hallId: string;
  code: string;
  doorType: DoorType;
  temperatureZone: TemperatureZone;
  adr: boolean;
  status: DockStatus;
}

export interface BookableResource {
  id: string;
  siteId: string;
  kind: ResourceKind;
  name: string;
  dockIds: string[];
  capacity: number;
  dailyCap?: number;
  directions: Direction[];
}

export interface TimelineEntry {
  status: BookingStatus;
  at: string;
  actor?: string;
}

export interface Booking {
  id: string;
  code: string;
  tenantId: string;
  siteId: string;
  resourceId: string;
  dockId?: string;
  carrier: string;
  plate?: string;
  loadType: string;
  direction: Direction;
  loadUnits: number;
  /** Site-local wall clock, HH:mm. */
  start: string;
  end: string;
  status: BookingStatus;
  safety: SafetyStatus;
  punctuality?: Punctuality;
  overCapacity?: boolean;
  references: string[];
  driverPhone?: string;
  timeline: TimelineEntry[];
}
