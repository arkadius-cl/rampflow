import { describe, expect, it } from 'vitest';
import {
  checkTaxId,
  initialTaxIdStatus,
  normalizeTaxId,
  taxIdEquivalents,
  taxIdTypeFits,
} from './tax-id.ts';
import { EuCountry, TaxIdCheck, TaxIdStatus, TaxIdType } from './values.ts';

const check = (type: TaxIdType, raw: string, country: EuCountry) =>
  checkTaxId(type, normalizeTaxId(type, raw, country), country);

/** One real VAT number per member state and the same number with a wrong check digit. */
const VAT_SAMPLES: Record<EuCountry, [valid: string, wrongCheckDigit: string]> = {
  AT: ['ATU13585627', 'ATU13585628'],
  BE: ['BE0411905847', 'BE0411905848'],
  BG: ['BG175074752', 'BG175074753'],
  CY: ['CY10259033P', 'CY10259034P'],
  CZ: ['CZ25123891', 'CZ25123892'],
  DE: ['DE136695976', 'DE136695977'],
  DK: ['DK13585628', 'DK13585629'],
  EE: ['EE100931558', 'EE100931559'],
  ES: ['ESA28015865', 'ESA28015866'],
  FI: ['FI20774740', 'FI20774741'],
  FR: ['FR40303265045', 'FR40303265046'],
  GR: ['EL094259216', 'EL094259217'],
  HR: ['HR33392005961', 'HR33392005962'],
  HU: ['HU12892312', 'HU12892313'],
  IE: ['IE6388047V', 'IE6388048V'],
  IT: ['IT00743110157', 'IT00743110158'],
  LT: ['LT119511515', 'LT119511516'],
  LU: ['LU15027442', 'LU15027443'],
  LV: ['LV40003521600', 'LV40003521601'],
  MT: ['MT11679112', 'MT11679113'],
  NL: ['NL004495445B01', 'NL004495446B01'],
  PL: ['PL5260250274', 'PL5260250275'],
  PT: ['PT501964843', 'PT501964844'],
  RO: ['RO18547290', 'RO18547291'],
  SE: ['SE556188840401', 'SE556188840501'],
  SI: ['SI50223054', 'SI50223055'],
  SK: ['SK2020317068', 'SK2020317069'],
};

describe('eu_vat per member state', () => {
  for (const country of Object.values(EuCountry)) {
    const [valid, wrong] = VAT_SAMPLES[country];
    it(`${country}: ${valid} passes, ${wrong} fails its check digit`, () => {
      expect(check(TaxIdType.eu_vat, valid, country)).toBe(TaxIdCheck.ok);
      expect(check(TaxIdType.eu_vat, wrong, country)).toBe(TaxIdCheck.tax_id_checksum);
    });
  }

  it('covers exactly the 27 member states', () => {
    expect(Object.keys(VAT_SAMPLES)).toHaveLength(27);
  });

  it('refuses a format that fits no member state rule', () => {
    expect(check(TaxIdType.eu_vat, 'DE12345', EuCountry.DE)).toBe(TaxIdCheck.tax_id_format);
  });
});

describe('normalization', () => {
  it('adds the prefix and strips spaces, dots, hyphens and slashes', () => {
    expect(normalizeTaxId(TaxIdType.eu_vat, '136 695 976', EuCountry.DE)).toBe('DE136695976');
    expect(normalizeTaxId(TaxIdType.eu_vat, 'de 136.695-976', EuCountry.DE)).toBe('DE136695976');
    expect(normalizeTaxId(TaxIdType.eu_vat, 'DE136695976', EuCountry.DE)).toBe('DE136695976');
    expect(normalizeTaxId(TaxIdType.pl_nip, '526-025-02-74', EuCountry.PL)).toBe('5260250274');
    expect(normalizeTaxId(TaxIdType.de_stn, '21/815/08150', EuCountry.DE)).toBe('2181508150');
  });

  it('accepts DE136695976 with and without prefix and spaces', () => {
    for (const raw of ['DE136695976', '136695976', 'DE 136 695 976', '136 695 976']) {
      expect(check(TaxIdType.eu_vat, raw, EuCountry.DE)).toBe(TaxIdCheck.ok);
    }
  });

  it('uses EL for Greece, also when the number is typed with GR', () => {
    expect(normalizeTaxId(TaxIdType.eu_vat, '094259216', EuCountry.GR)).toBe('EL094259216');
    expect(normalizeTaxId(TaxIdType.eu_vat, 'GR094259216', EuCountry.GR)).toBe('EL094259216');
    expect(check(TaxIdType.eu_vat, '094259216', EuCountry.GR)).toBe(TaxIdCheck.ok);
  });
});

describe('pl_nip', () => {
  it('5260250274 passes, 5260250275 fails its check digit', () => {
    expect(check(TaxIdType.pl_nip, '5260250274', EuCountry.PL)).toBe(TaxIdCheck.ok);
    expect(check(TaxIdType.pl_nip, '5260250275', EuCountry.PL)).toBe(TaxIdCheck.tax_id_checksum);
  });

  it('needs exactly 10 digits', () => {
    expect(check(TaxIdType.pl_nip, '526025027', EuCountry.PL)).toBe(TaxIdCheck.tax_id_format);
    expect(check(TaxIdType.pl_nip, 'PL5260250274', EuCountry.PL)).toBe(TaxIdCheck.tax_id_format);
  });
});

describe('de_stn', () => {
  it('stores a W-IdNr without the hyphen and checks its VAT part', () => {
    expect(normalizeTaxId(TaxIdType.de_stn, 'DE136695976-00001', EuCountry.DE)).toBe(
      'DE13669597600001',
    );
    expect(check(TaxIdType.de_stn, 'DE136695976-00001', EuCountry.DE)).toBe(TaxIdCheck.ok);
    expect(check(TaxIdType.de_stn, 'DE136695977-00001', EuCountry.DE)).toBe(
      TaxIdCheck.tax_id_checksum,
    );
  });

  it('accepts 10-, 11- and 13-digit tax numbers by format', () => {
    expect(check(TaxIdType.de_stn, '2181508150', EuCountry.DE)).toBe(TaxIdCheck.ok);
    expect(check(TaxIdType.de_stn, '21815081505', EuCountry.DE)).toBe(TaxIdCheck.ok);
    expect(check(TaxIdType.de_stn, '2181081508150', EuCountry.DE)).toBe(TaxIdCheck.ok);
    expect(check(TaxIdType.de_stn, '218150815', EuCountry.DE)).toBe(TaxIdCheck.tax_id_format);
    expect(check(TaxIdType.de_stn, '218150815050', EuCountry.DE)).toBe(TaxIdCheck.tax_id_format);
    expect(check(TaxIdType.de_stn, 'DE1366959760001', EuCountry.DE)).toBe(TaxIdCheck.tax_id_format);
  });
});

describe('type and country', () => {
  it('allows de_stn only in Germany and pl_nip only in Poland', () => {
    expect(taxIdTypeFits(TaxIdType.pl_nip, EuCountry.DE)).toBe(false);
    expect(taxIdTypeFits(TaxIdType.de_stn, EuCountry.AT)).toBe(false);
    expect(taxIdTypeFits(TaxIdType.eu_vat, EuCountry.AT)).toBe(true);
    expect(check(TaxIdType.pl_nip, '5260250274', EuCountry.DE)).toBe(TaxIdCheck.tax_id_country);
    expect(check(TaxIdType.de_stn, '2181508150', EuCountry.PL)).toBe(TaxIdCheck.tax_id_country);
  });

  it('refuses the VAT prefix of another member state', () => {
    expect(check(TaxIdType.eu_vat, 'DE136695976', EuCountry.AT)).toBe(TaxIdCheck.tax_id_country);
  });
});

describe('initial status and equivalents', () => {
  it('starts eu_vat pending and the national ids unverified', () => {
    expect(initialTaxIdStatus(TaxIdType.eu_vat)).toBe(TaxIdStatus.pending);
    expect(initialTaxIdStatus(TaxIdType.de_stn)).toBe(TaxIdStatus.unverified);
    expect(initialTaxIdStatus(TaxIdType.pl_nip)).toBe(TaxIdStatus.unverified);
  });

  it('pairs a NIP with its PL VAT number both ways', () => {
    expect(taxIdEquivalents(TaxIdType.pl_nip, '5260250274')).toEqual([
      { type: TaxIdType.pl_nip, value: '5260250274' },
      { type: TaxIdType.eu_vat, value: 'PL5260250274' },
    ]);
    expect(taxIdEquivalents(TaxIdType.eu_vat, 'PL5260250274')).toEqual([
      { type: TaxIdType.eu_vat, value: 'PL5260250274' },
      { type: TaxIdType.pl_nip, value: '5260250274' },
    ]);
  });

  it('pairs a W-IdNr with the VAT number of its first 11 characters', () => {
    expect(taxIdEquivalents(TaxIdType.de_stn, 'DE13669597600001')).toEqual([
      { type: TaxIdType.de_stn, value: 'DE13669597600001' },
      { type: TaxIdType.eu_vat, value: 'DE136695976' },
    ]);
    expect(taxIdEquivalents(TaxIdType.de_stn, '2181508150')).toEqual([
      { type: TaxIdType.de_stn, value: '2181508150' },
    ]);
  });
});
