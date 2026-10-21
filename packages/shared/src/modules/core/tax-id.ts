import {
  austria,
  belgium,
  bulgaria,
  type Country,
  checkVAT,
  croatia,
  cyprus,
  czechRepublic,
  denmark,
  estonia,
  finland,
  france,
  germany,
  greece,
  hungary,
  ireland,
  italy,
  latvia,
  lithuania,
  luxembourg,
  malta,
  netherlands,
  poland,
  portugal,
  romania,
  slovakiaRepublic,
  slovenia,
  spain,
  sweden,
} from 'jsvat';
import { EuCountry, TaxIdCheck, TaxIdStatus, TaxIdType } from './values.ts';

// RG-05 and the tax-id-validation spec: normalization and the synchronous format and check-digit
// rules, shared by the form (zodResolver) and the API (design decision 7).

const VAT_RULES: Record<EuCountry, Country> = {
  AT: austria,
  BE: belgium,
  BG: bulgaria,
  CY: cyprus,
  CZ: czechRepublic,
  DE: germany,
  DK: denmark,
  EE: estonia,
  ES: spain,
  FI: finland,
  FR: france,
  GR: greece,
  HR: croatia,
  HU: hungary,
  IE: ireland,
  IT: italy,
  LT: lithuania,
  LU: luxembourg,
  LV: latvia,
  MT: malta,
  NL: netherlands,
  PL: poland,
  PT: portugal,
  RO: romania,
  SE: sweden,
  SI: slovenia,
  SK: slovakiaRepublic,
};

/** The VAT prefix of a member state: its ISO code, except `EL` for Greece. */
export const vatPrefix = (country: EuCountry): string =>
  country === EuCountry.GR ? 'EL' : country;

const VAT_PREFIXES = new Set<string>([...Object.values(EuCountry).map(vatPrefix), EuCountry.GR]);

/** Whether a company of `country` may give a tax id of `type` at all. */
export function taxIdTypeFits(type: TaxIdType, country: EuCountry): boolean {
  if (type === TaxIdType.de_stn) return country === EuCountry.DE;
  if (type === TaxIdType.pl_nip) return country === EuCountry.PL;
  return true;
}

/**
 * Without spaces, dots, hyphens and slashes, upper-cased. An `eu_vat` without a country prefix
 * gets the prefix of `country`, and Greece's `GR` becomes `EL`.
 */
export function normalizeTaxId(type: TaxIdType, value: string, country: EuCountry): string {
  const compact = value.replace(/[\s./-]/g, '').toUpperCase();
  if (type !== TaxIdType.eu_vat) return compact;
  const head = compact.slice(0, 2);
  if (!VAT_PREFIXES.has(head)) return `${vatPrefix(country)}${compact}`;
  return head === EuCountry.GR ? `EL${compact.slice(2)}` : compact;
}

const NIP_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7];

function nipCheckDigitOk(nip: string): boolean {
  const digits = [...nip].map(Number);
  const sum = NIP_WEIGHTS.reduce((acc, w, i) => acc + w * (digits[i] ?? 0), 0);
  // A remainder of 10 matches no digit, so such a NIP is never issued and fails here too.
  return sum % 11 === digits[9];
}

function checkVat(vat: string, country: EuCountry): TaxIdCheck {
  if (!vat.startsWith(vatPrefix(country))) return TaxIdCheck.tax_id_country;
  const result = checkVAT(vat, [VAT_RULES[country]]);
  if (result.isValid) return TaxIdCheck.ok;
  return result.isValidFormat ? TaxIdCheck.tax_id_checksum : TaxIdCheck.tax_id_format;
}

/** `DE` + 9 digits + 5 digits; the 9 digits are the company's VAT number. */
const W_IDNR = /^DE\d{14}$/;
/** A state tax number (10 or 11 digits) or a federal tax number (13 digits). */
const STEUERNUMMER = /^(\d{10,11}|\d{13})$/;

/** Checks a value as `normalizeTaxId` returns it. */
export function checkTaxId(type: TaxIdType, value: string, country: EuCountry): TaxIdCheck {
  if (!taxIdTypeFits(type, country)) return TaxIdCheck.tax_id_country;
  switch (type) {
    case TaxIdType.eu_vat:
      return checkVat(value, country);
    case TaxIdType.pl_nip:
      if (!/^\d{10}$/.test(value)) return TaxIdCheck.tax_id_format;
      return nipCheckDigitOk(value) ? TaxIdCheck.ok : TaxIdCheck.tax_id_checksum;
    case TaxIdType.de_stn:
      if (W_IDNR.test(value)) {
        return checkVat(value.slice(0, 11), EuCountry.DE) === TaxIdCheck.ok
          ? TaxIdCheck.ok
          : TaxIdCheck.tax_id_checksum;
      }
      return STEUERNUMMER.test(value) ? TaxIdCheck.ok : TaxIdCheck.tax_id_format;
  }
}

/** `eu_vat` waits for the VIES job; the national ids have no registry check. */
export const initialTaxIdStatus = (type: TaxIdType): TaxIdStatus =>
  type === TaxIdType.eu_vat ? TaxIdStatus.pending : TaxIdStatus.unverified;

export interface TaxId {
  type: TaxIdType;
  value: string;
}

/**
 * The stored forms that name the same registration, the given one first: a NIP and its `PL`
 * VAT number, a W-IdNr and the VAT number of its first 11 characters.
 */
export function taxIdEquivalents(type: TaxIdType, value: string): TaxId[] {
  const self = { type, value };
  if (type === TaxIdType.pl_nip) return [self, { type: TaxIdType.eu_vat, value: `PL${value}` }];
  if (type === TaxIdType.eu_vat && /^PL\d{10}$/.test(value)) {
    return [self, { type: TaxIdType.pl_nip, value: value.slice(2) }];
  }
  if (type === TaxIdType.de_stn && W_IDNR.test(value)) {
    return [self, { type: TaxIdType.eu_vat, value: value.slice(0, 11) }];
  }
  return [self];
}
