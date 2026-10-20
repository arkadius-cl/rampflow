import * as z from 'zod';
import { BookingStatus } from './values.ts';

declare const booking: { status: BookingStatus; note: string };
declare const value: unknown;
declare function t(key: string): string;

export const isText = typeof value === 'string';
export const isTextFlipped = 'object' !== typeof value;
export const blank = booking.note === '';
export const blankDouble = "" !== booking.note;
export const interpolated = booking.note === `${booking.status}!`;
export const noShow = booking.status === BookingStatus.no_show;
export const ordered = booking.note < 'm';

export function rank(status: BookingStatus): number {
  switch (status) {
    case BookingStatus.requested:
      return 1;
    default:
      return 0;
  }
}

export const statusSchema = z.enum(BookingStatus);
export const requestedSchema = z.literal(BookingStatus.requested);
export const textSchema = z.string().min(1, 'Required');

export const transitions = { status: 'requested', next: 'confirmed' } as const;
export const rows = [{ status: 'requested' }] as const;
export const routes = [BookingStatus.requested, BookingStatus.no_show] as const;
export const labels = { requested: 'Requested', no_show: 'No show' } as const;
export const actorParty = { staff: 'tenant', carrier: 'carrier' } as const;
export const card = { title: 'Gate 1', label: t('yard.gate'), status: BookingStatus.done };

console.log('booking loaded');
t('booking.status.no_show');

// A query key mixes strings with variables; it is not a value set.
export const queryKey = (orgId: string) => ['tenant', orgId, 'staff'] as const;
// `reason` is free text in most bodies; typed reasons are left to `pnpm values:check`.
export const cancelled = { reason: 'Ware nicht fertig' };
// Labels and codes in fields named like discriminants are text, not set members.
export const membership = { role: 'Tenant admin', code: 'A-01' };
export const emptyForm = { type: '', status: '' };
