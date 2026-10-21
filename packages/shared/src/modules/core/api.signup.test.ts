import { describe, expect, it } from 'vitest';
import { SignupBody } from './api.signup.ts';
import { EuCountry, Salutation, TaxIdCheck, TaxIdType } from './values.ts';

const form = {
  givenName: 'Jonas',
  familyName: 'Petersen',
  email: 'ops@nordhafen.example',
  password: 'kuehlkette-2026',
  companyName: 'Nordhafen Kühllogistik GmbH',
  country: EuCountry.DE,
  taxIdType: TaxIdType.eu_vat,
  taxIdValue: '136 695 976',
  altcha: 'payload',
};

const issuesOf = (input: unknown) => {
  const result = SignupBody.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((i) => ({ path: i.path, message: i.message }));
};

describe('SignupBody', () => {
  it('defaults the salutation to null and normalizes the tax id', () => {
    expect(SignupBody.parse(form)).toMatchObject({ salutation: null, taxIdValue: 'DE136695976' });
    expect(SignupBody.parse({ ...form, salutation: Salutation.ms }).salutation).toBe(Salutation.ms);
  });

  it('refuses a 9-character password at its path', () => {
    expect(issuesOf({ ...form, password: '123456789' })).toEqual([
      { path: ['password'], message: expect.any(String) },
    ]);
  });

  it('refuses a country outside the EU at its path', () => {
    expect(issuesOf({ ...form, country: 'CH' }).map((i) => i.path)).toEqual([['country']]);
  });

  it('trims names and caps them at 60 characters', () => {
    expect(SignupBody.parse({ ...form, givenName: '  Jonas ' }).givenName).toBe('Jonas');
    expect(SignupBody.parse({ ...form, familyName: 'x'.repeat(60) }).familyName).toHaveLength(60);
    expect(issuesOf({ ...form, familyName: 'x'.repeat(61) }).map((i) => i.path)).toEqual([
      ['familyName'],
    ]);
    expect(issuesOf({ ...form, givenName: '   ' }).map((i) => i.path)).toEqual([['givenName']]);
  });

  it('puts a type that does not fit the country at taxIdType', () => {
    expect(issuesOf({ ...form, taxIdType: TaxIdType.pl_nip, taxIdValue: '5260250274' })).toEqual([
      { path: ['taxIdType'], message: TaxIdCheck.tax_id_country },
    ]);
  });

  it('puts format, check digit and foreign prefix at taxIdValue', () => {
    expect(issuesOf({ ...form, taxIdValue: 'DE136695977' })).toEqual([
      { path: ['taxIdValue'], message: TaxIdCheck.tax_id_checksum },
    ]);
    expect(issuesOf({ ...form, taxIdValue: '1234' })).toEqual([
      { path: ['taxIdValue'], message: TaxIdCheck.tax_id_format },
    ]);
    expect(issuesOf({ ...form, country: EuCountry.AT, taxIdValue: 'DE136695976' })).toEqual([
      { path: ['taxIdValue'], message: TaxIdCheck.tax_id_country },
    ]);
  });
});
