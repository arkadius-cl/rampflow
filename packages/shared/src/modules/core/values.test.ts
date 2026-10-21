import { describe, expect, it } from 'vitest';
import { CountryGroup, countryGroupOf, EuCountry, SiteCountry } from './values.ts';

describe('countryGroupOf', () => {
  const codes = Object.values(SiteCountry);
  const inGroup = (group: CountryGroup) => codes.filter((c) => countryGroupOf(c) === group);

  it('puts the 27 EU member states in eu and the other 30 admissible countries in other', () => {
    expect(inGroup(CountryGroup.eu).toSorted()).toEqual(Object.values(EuCountry).toSorted());
    expect(inGroup(CountryGroup.eu)).toHaveLength(27);
    expect(inGroup(CountryGroup.other)).toHaveLength(30);
    expect(countryGroupOf(SiteCountry.TR)).toBe(CountryGroup.other);
    expect(countryGroupOf(SiteCountry.MT)).toBe(CountryGroup.eu);
  });
});
