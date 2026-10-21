import { describe, expect, it } from 'vitest';
import { WeeklyHours } from './weekly-hours.ts';

const issuePaths = (rows: unknown) => {
  const result = WeeklyHours.safeParse(rows);
  return result.success ? null : result.error.issues.map((i) => i.path);
};

describe('WeeklyHours', () => {
  it('accepts an empty week', () => {
    expect(WeeklyHours.parse([])).toEqual([]);
  });

  it('accepts 24:00 as a closing time and adjacent windows', () => {
    const rows = [
      { weekday: 1, opens: '06:00', closes: '12:00' },
      { weekday: 1, opens: '12:00', closes: '24:00' },
    ];
    expect(issuePaths(rows)).toBeNull();
  });

  it('rejects 24:00 as an opening time', () => {
    expect(issuePaths([{ weekday: 1, opens: '24:00', closes: '24:00' }])).toContainEqual([
      0,
      'opens',
    ]);
  });

  it('rejects a window that does not open before it closes', () => {
    expect(issuePaths([{ weekday: 2, opens: '14:00', closes: '14:00' }])).toEqual([[0, 'closes']]);
    expect(issuePaths([{ weekday: 2, opens: '15:00', closes: '14:00' }])).toEqual([[0, 'closes']]);
  });

  it('rejects an overlap on the same weekday at the later window', () => {
    const rows = [
      { weekday: 1, opens: '06:00', closes: '14:00' },
      { weekday: 2, opens: '13:00', closes: '22:00' },
      { weekday: 1, opens: '13:00', closes: '22:00' },
    ];
    expect(issuePaths(rows)).toEqual([[2]]);
  });

  it('rejects more than 70 windows', () => {
    const rows = Array.from({ length: 71 }, (_, i) => ({
      weekday: (i % 7) + 1,
      opens: `${String(Math.floor(i / 7)).padStart(2, '0')}:00`,
      closes: `${String(Math.floor(i / 7)).padStart(2, '0')}:30`,
    }));
    expect(issuePaths(rows)).toEqual([[]]);
  });
});
