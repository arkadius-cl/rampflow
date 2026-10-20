import type {
  BookingStatus,
  Direction,
  Punctuality,
  ResourceKind,
} from '@rampflow/shared/modules/booking/values';
import type { DockStatus, DoorType, TemperatureZone } from '@rampflow/shared/modules/core/values';
import type { BriefingState } from '@rampflow/shared/modules/safety/values';

// Data shapes of the design prototype (`/design`). Their value sets come from @rampflow/shared.

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
  safety: BriefingState;
  punctuality?: Punctuality;
  overCapacity?: boolean;
  references: string[];
  driverPhone?: string;
  timeline: TimelineEntry[];
}
