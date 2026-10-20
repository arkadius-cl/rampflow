import { describe, expect, it } from 'vitest';
import {
  acknowledgementStatus,
  expiresAtFor,
  isAcknowledgementValid,
  materialFloor,
} from './validity.ts';
import { VersionStatus } from './values.ts';

const now = new Date('2026-10-25T06:30:00Z');
const later = new Date('2027-10-25T06:30:00Z');

describe('materialFloor', () => {
  it('is the newest material version that was ever published, ignoring drafts', () => {
    expect(materialFloor([])).toBe(0);
    expect(
      materialFloor([
        { version: 1, status: VersionStatus.retired, materialChange: false },
        { version: 2, status: VersionStatus.retired, materialChange: true },
        { version: 3, status: VersionStatus.published, materialChange: false },
        { version: 4, status: VersionStatus.draft, materialChange: true },
      ]),
    ).toBe(2);
  });
});

describe('acknowledgementStatus', () => {
  const ctx = { now, bookingId: 'booking-1', materialFloor: 0 };

  it('is valid before expiry and expired from it on', () => {
    const ack = { version: 1, bookingId: 'booking-0', expiresAt: later };
    expect(acknowledgementStatus(ack, ctx)).toBe('valid');
    expect(acknowledgementStatus(ack, { ...ctx, now: later })).toBe('expired');
  });

  it('is outdated below the material floor, before anything else', () => {
    const ack = { version: 2, bookingId: 'booking-1', expiresAt: now };
    expect(acknowledgementStatus(ack, { ...ctx, materialFloor: 3 })).toBe('outdated');
    expect(acknowledgementStatus(ack, { ...ctx, materialFloor: 2 })).toBe('expired');
  });

  it('covers only its own visit without an expiry', () => {
    const ack = { version: 1, bookingId: 'booking-1', expiresAt: null };
    expect(isAcknowledgementValid(ack, ctx)).toBe(true);
    expect(acknowledgementStatus(ack, { ...ctx, bookingId: 'booking-2' })).toBe('visit_only');
    expect(acknowledgementStatus(ack, { ...ctx, bookingId: null })).toBe('visit_only');
    expect(acknowledgementStatus({ ...ack, bookingId: null }, { ...ctx, bookingId: null })).toBe(
      'visit_only',
    );
  });
});

describe('expiresAtFor', () => {
  it('adds the validity days, and 0 means this visit only', () => {
    expect(expiresAtFor(now, 365)).toEqual(new Date('2027-10-25T06:30:00Z'));
    expect(expiresAtFor(now, 0)).toBeNull();
  });
});
