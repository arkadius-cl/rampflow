import * as z from 'zod';
import { ZodIssueCode } from '../../values/validation.ts';
import { Email, Password, StaffLocale } from './api.auth.ts';
import { checkTaxId, normalizeTaxId, taxIdTypeFits } from './tax-id.ts';
import { EuCountry, Salutation, TaxIdCheck, TaxIdType } from './values.ts';

// Request and response bodies of /api/public/signups (RG-01 to RG-04, design decisions 1 and 7).

export const PERSON_NAME_MAX = 60;
export const COMPANY_NAME_MAX = 120;

const personName = z.string().trim().min(1).max(PERSON_NAME_MAX);

/**
 * The registration form. The tax id is checked for the chosen country and comes out
 * normalized; a failure is a custom issue whose message and `params.code` are the `TaxIdCheck`.
 */
export const SignupBody = z
  .object({
    salutation: z.enum(Salutation).nullable().default(null),
    givenName: personName,
    familyName: personName,
    email: Email,
    password: Password,
    companyName: z.string().trim().min(1).max(COMPANY_NAME_MAX),
    country: z.enum(EuCountry),
    taxIdType: z.enum(TaxIdType),
    taxIdValue: z.string().trim().min(1).max(40),
    /** The page's language, used for the verification email and the new account. */
    locale: StaffLocale.optional(),
    /** The ALTCHA widget's base64 payload: the signed challenge and its solution. */
    altcha: z.string().min(1).max(8192),
  })
  .superRefine((body, ctx) => {
    const value = normalizeTaxId(body.taxIdType, body.taxIdValue, body.country);
    const result = checkTaxId(body.taxIdType, value, body.country);
    if (result === TaxIdCheck.ok) return;
    const fits = taxIdTypeFits(body.taxIdType, body.country);
    ctx.addIssue({
      code: ZodIssueCode.custom,
      path: [fits ? 'taxIdValue' : 'taxIdType'],
      message: result,
      params: { code: result },
    });
  })
  .transform((body) => ({
    ...body,
    taxIdValue: normalizeTaxId(body.taxIdType, body.taxIdValue, body.country),
  }));
export type SignupBody = z.infer<typeof SignupBody>;
export type SignupForm = z.input<typeof SignupBody>;

/** An ALTCHA v2 challenge as `altcha-lib` creates it; the widget solves it in the browser. */
export interface SignupChallenge {
  parameters: {
    algorithm: string;
    nonce: string;
    salt: string;
    cost: number;
    keyLength: number;
    keyPrefix: string;
    keySignature?: string;
    memoryCost?: number;
    parallelism?: number;
    expiresAt?: number;
    data?: Record<string, string | number | boolean | null>;
  };
  signature?: string;
}

/** What the verify page shows before the click (login CSRF, RG-02). */
export interface SignupInspect {
  email: string;
  companyName: string;
  possibleDuplicate: boolean;
}

export interface SignupVerified {
  tenantId: string;
  possibleDuplicate: boolean;
}
