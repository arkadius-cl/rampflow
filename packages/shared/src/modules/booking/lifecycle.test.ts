import { describe, expect, it } from 'vitest';
import type { PermissionKey } from '../../registry.ts';
import { Permission } from '../../values/keys.ts';
import { availableCommands, punctualityOf, sourceStates } from './lifecycle.ts';
import { BookingParty, BookingStatus } from './values.ts';

describe('the command table', () => {
  it('lets a carrier edit the avis only while confirmed, and staff until done', () => {
    expect(sourceStates('update_avis', BookingParty.carrier)).toEqual(['confirmed']);
    expect(sourceStates('update_avis', BookingParty.staff)).toContain('done');
    expect(sourceStates('update_avis', BookingParty.staff)).not.toContain('departed');
  });

  it('offers a dock operator dock progress but never check-out (module contract, "Web gating")', () => {
    const dockOperator = new Set<PermissionKey>([
      Permission.booking.view,
      Permission.yard.call,
      Permission.yard.dock,
    ]);
    const can = (p: PermissionKey) => dockOperator.has(p);
    expect(availableCommands(BookingStatus.at_dock, BookingParty.staff, can)).toEqual([
      'start_loading',
      'complete',
    ]);
    expect(availableCommands(BookingStatus.done, BookingParty.staff, can)).toEqual([]);
  });

  it('offers nothing from the final states but check-in from no_show', () => {
    const all = () => true;
    for (const status of ['departed', 'cancelled', 'turned_away', 'requested'] as const) {
      expect(availableCommands(status, BookingParty.staff, all)).toEqual([]);
    }
    expect(availableCommands(BookingStatus.no_show, BookingParty.staff, all)).toEqual([
      'check_in',
      'turn_away',
      'link_acknowledgement',
    ]);
  });
});

describe('punctuality (booking lifecycle, "Punctuality")', () => {
  it('is early below the tolerance, late above the grace, on time between', () => {
    expect(punctualityOf(-31, 30, 15)).toBe('early');
    expect(punctualityOf(-30, 30, 15)).toBe('on_time');
    expect(punctualityOf(15, 30, 15)).toBe('on_time');
    expect(punctualityOf(16, 30, 15)).toBe('late');
  });
});
