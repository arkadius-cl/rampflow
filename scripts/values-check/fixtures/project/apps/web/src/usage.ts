import type { BookingStatus } from '@rampflow/shared/modules/booking/values';
import { LoadStatus } from '@rampflow/shared/modules/booking/values';
import type { PermissionKey } from '@rampflow/shared/registry';
import { setCookie } from 'fake-hono';
import { Button, buttonVariants } from './components/ui/button.tsx';

export interface Booking {
  status: BookingStatus;
  load: LoadStatus;
  party: 'carrier' | 'staff';
}

function requirePermission(key: PermissionKey): string {
  return key;
}

function count(status: LoadStatus): number {
  return status.length + LoadStatus.loading.length;
}

export function compare(b: Booking): boolean {
  return b.status === 'cancelled'; // → BookingStatus.cancelled
}

export function argument(): number {
  return count('loading'); // → LoadStatus.loading
}

export function property(): Booking {
  return {
    status: 'confirmed', // → BookingStatus.confirmed
    load: 'confirmed', // → LoadStatus.confirmed
    party: 'staff', // → create 'carrier' | 'staff'
  };
}

export function returned(): BookingStatus {
  return 'requested'; // → BookingStatus.requested
}

export function guard(): string {
  return requirePermission('booking.view'); // → Permission.booking.view
}

export function cases(b: Booking): number {
  switch (b.load) {
    case 'checked_in': // → LoadStatus.checked_in
      return 1;
    default:
      return 0;
  }
}

export function ignored(b: Booking): boolean {
  // values-check-ignore: the fixture proves that a comment suppresses one report
  return b.status === 'no_show'; // → ignored
}

export function library(free: (key: string) => string): string {
  setCookie('session', free('x'), { sameSite: 'Lax' }); // → silent
  Button({ variant: 'outline' }); // → silent
  return buttonVariants({ size: 'lg' }); // → silent
}

export function narrowed(b: Booking): b is Booking & { status: 'cancelled' } {
  return b.status.length > 0;
}
