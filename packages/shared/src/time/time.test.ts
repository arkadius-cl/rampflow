import { describe, expect, it } from 'vitest';
import {
  addDays,
  formatSiteTime,
  instantsAt,
  isoWeekday,
  type LocalDate,
  type LocalTime,
  localDateTimeSchema,
  localDayRange,
  siteDay,
  slotGrid,
  type TimeZone,
  timeZoneSchema,
  viewerTime,
  wallClock,
} from './index.ts';

const BERLIN = 'Europe/Berlin' as TimeZone;
const BUCHAREST = 'Europe/Bucharest' as TimeZone;
const d = (s: string) => s as LocalDate;
const t = (s: string) => s as LocalTime;
const iso = (dates: Date[]) => dates.map((x) => x.toISOString());
const hours = (r: { start: Date; end: Date }) => (r.end.getTime() - r.start.getTime()) / 3_600_000;

describe('instantsAt', () => {
  it('maps 24:00 to the start of the next local day', () => {
    expect(iso(instantsAt(d('2026-10-19'), t('24:00'), BERLIN))).toEqual([
      '2026-10-19T22:00:00.000Z',
    ]);
    expect(iso(instantsAt(d('2026-10-24'), t('24:00'), BERLIN))).toEqual([
      '2026-10-24T22:00:00.000Z',
    ]);
    expect(iso(instantsAt(d('2026-10-25'), t('24:00'), BERLIN))).toEqual([
      '2026-10-25T23:00:00.000Z',
    ]);
  });

  it('returns both instants of an autumn fold and none in a spring gap', () => {
    expect(iso(instantsAt(d('2026-10-25'), t('02:30'), BERLIN))).toEqual([
      '2026-10-25T00:30:00.000Z',
      '2026-10-25T01:30:00.000Z',
    ]);
    expect(instantsAt(d('2027-03-28'), t('02:30'), BERLIN)).toEqual([]);
    expect(iso(instantsAt(d('2027-03-28'), t('03:00'), BERLIN))).toEqual([
      '2027-03-28T01:00:00.000Z',
    ]);
  });
});

describe('localDayRange and slotGrid on DST days', () => {
  it('Berlin 2026-10-25 lasts 25 hours with 02:00 and 02:30 twice', () => {
    expect(hours(localDayRange(d('2026-10-25'), BERLIN))).toBe(25);
    const grid = slotGrid(d('2026-10-25'), BERLIN, 30);
    expect(grid).toHaveLength(50);
    const folded = grid.filter((s) => s.fold !== null);
    expect(folded.map((s) => `${s.wallTime} ${s.fold}`)).toEqual([
      '02:00 earlier',
      '02:30 earlier',
      '02:00 later',
      '02:30 later',
    ]);
    const starts = grid.map((s) => s.start.getTime());
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('Berlin 2027-03-28 lasts 23 hours and skips 02:00 and 02:30', () => {
    expect(hours(localDayRange(d('2027-03-28'), BERLIN))).toBe(23);
    const grid = slotGrid(d('2027-03-28'), BERLIN, 30);
    expect(grid).toHaveLength(46);
    expect(grid.map((s) => s.wallTime)).not.toContain('02:00');
    expect(grid.map((s) => s.wallTime)).not.toContain('02:30');
    expect(grid.every((s) => s.fold === null)).toBe(true);
  });

  it('an ordinary day has 24 hours and 48 half-hour slots', () => {
    expect(hours(localDayRange(d('2026-10-19'), BERLIN))).toBe(24);
    expect(slotGrid(d('2026-10-19'), BERLIN, 30)).toHaveLength(48);
  });
});

describe('durations across the fold', () => {
  it('a 60-minute booking at 02:30 earlier ends at 02:30 later wall time', () => {
    const [earlier, later] = instantsAt(d('2026-10-25'), t('02:30'), BERLIN);
    const end = new Date((earlier as Date).getTime() + 60 * 60_000);
    expect(end).toEqual(later);
    expect(wallClock(end, BERLIN)).toEqual({ day: '2026-10-25', time: '02:30' });
    expect(formatSiteTime(earlier as Date, BERLIN, 'en')).toBe('02:30 CEST');
    expect(formatSiteTime(end, BERLIN, 'en')).toBe('02:30 CET');
  });
});

describe('a Bucharest site viewed from Berlin', () => {
  it('folds 03:00 to 04:00 Bucharest time, labels EEST and EET, hints Berlin an hour earlier', () => {
    const grid = slotGrid(d('2026-10-25'), BUCHAREST, 30);
    expect(grid.filter((s) => s.fold === 'earlier').map((s) => s.wallTime)).toEqual([
      '03:00',
      '03:30',
    ]);
    const [earlier, later] = instantsAt(d('2026-10-25'), t('03:30'), BUCHAREST) as [Date, Date];
    expect(formatSiteTime(earlier, BUCHAREST, 'en')).toBe('03:30 EEST');
    expect(formatSiteTime(later, BUCHAREST, 'en')).toBe('03:30 EET');
    expect(viewerTime(earlier, BUCHAREST, BERLIN, 'en')).toEqual({ time: '02:30', zone: 'CEST' });
    expect(viewerTime(later, BUCHAREST, BERLIN, 'en')).toEqual({ time: '02:30', zone: 'CET' });
    expect(viewerTime(later, BERLIN, 'Europe/Paris' as TimeZone, 'en')).toBeNull();
  });
});

describe('labels per locale', () => {
  it('uses MEZ for de and CET for en and pl', () => {
    const winter = new Date('2027-01-11T07:30:00Z');
    expect(formatSiteTime(winter, BERLIN, 'de')).toBe('08:30 MEZ');
    expect(formatSiteTime(winter, BERLIN, 'en')).toBe('08:30 CET');
    expect(formatSiteTime(winter, BERLIN, 'pl')).toBe('08:30 CET');
  });
});

describe('local values', () => {
  it('validates zones, local date-times and walks calendar days', () => {
    expect(timeZoneSchema.safeParse('Europe/Berlin').success).toBe(true);
    expect(timeZoneSchema.safeParse('Mars/Olympus_Mons').success).toBe(false);
    expect(localDateTimeSchema.safeParse('2026-12-24T00:00').success).toBe(true);
    expect(localDateTimeSchema.safeParse('2026-02-30T00:00').success).toBe(false);
    expect(addDays(d('2026-12-31'), 1)).toBe('2027-01-01');
    expect(isoWeekday(d('2026-10-19'))).toBe(1);
    expect(isoWeekday(d('2026-10-25'))).toBe(7);
    expect(siteDay(new Date('2026-10-24T22:30:00Z'), BERLIN)).toBe('2026-10-25');
  });
});
