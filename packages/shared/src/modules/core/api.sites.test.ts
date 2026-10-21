import { describe, expect, it } from 'vitest';
import { WeeklyHours } from '../../time/weekly-hours.ts';
import { StaffLocale } from '../../values/locales.ts';
import { CreateSite, hoursTemplateRows } from './api.sites.ts';
import { PresetHoursTemplate, SiteCountry } from './values.ts';

const site = {
  name: 'Bremerhaven',
  addressLine1: 'Am Seedeich 40',
  postalCode: '27572',
  city: 'Bremerhaven',
  country: SiteCountry.DE,
  subdivision: 'DE-HB',
  timeZone: 'Europe/Berlin',
  defaultLocale: StaffLocale.de,
};

describe('hoursTemplateRows', () => {
  it.each(Object.values(PresetHoursTemplate))('%s parses as weekly hours', (template) => {
    expect(WeeklyHours.parse(hoursTemplateRows[template])).toHaveLength(5);
  });

  it('one shift runs Monday to Friday 06:00 to 14:00', () => {
    expect(hoursTemplateRows.one_shift).toEqual(
      [1, 2, 3, 4, 5].map((weekday) => ({ weekday, opens: '06:00', closes: '14:00' })),
    );
  });
});

describe('CreateSite', () => {
  it('requires hours', () => {
    for (const body of [site, { ...site, hours: [] }]) {
      const result = CreateSite.safeParse(body);
      expect(result.success).toBe(false);
      expect(result.error?.issues.map((i) => i.path)).toEqual([['hours']]);
    }
  });

  it('reports an overlap at the window', () => {
    const result = CreateSite.safeParse({
      ...site,
      hours: [
        { weekday: 1, opens: '06:00', closes: '14:00' },
        { weekday: 1, opens: '13:00', closes: '22:00' },
      ],
    });
    expect(result.error?.issues.map((i) => i.path)).toEqual([['hours', 1]]);
  });

  it('accepts a template', () => {
    expect(CreateSite.safeParse({ ...site, hours: hoursTemplateRows.one_shift }).success).toBe(
      true,
    );
  });
});
