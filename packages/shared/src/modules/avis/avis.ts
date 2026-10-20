import * as z from 'zod';
import { values } from '../../values/define.ts';
import { DriverLocale } from '../../values/locales.ts';
import { ZodIssueCode } from '../../values/validation.ts';
import {
  AdrClass,
  DangerousGoodsUnit,
  LoadUnitType,
  PackingGroup,
  ReferenceType,
  VehicleType,
} from './values.ts';

// The avis of a booking (AV-01): the fields of domain research §1 without loading method,
// customs, SSCC and attachments. Parsing normalizes plates, phones and UN numbers, so the API
// stores one spelling and searches (YD-01, TN-06) match.

export { AdrClass, LoadUnitType, PackingGroup, VehicleType };
export const LOAD_UNIT_TYPES = values(LoadUnitType);

/** UN/ECE Recommendation 21 package codes, so an EDI export is a lookup. */
export const REC21_CODE: Record<LoadUnitType, string> = {
  eur_pallet: 'OH',
  eur_half_pallet: 'OG',
  industrial_pallet: 'PX',
  one_way_pallet: 'O4',
  box_pallet: 'PB',
  roll_cage: 'CW',
  small_load_carrier: 'CR',
  carton: 'CT',
  parcel: 'PC',
  loose: 'NE',
  coil: 'CL',
  bulk: 'VR',
  ibc: 'WA',
  other: 'ZZ',
};

export const VEHICLE_TYPES = values(VehicleType);
export const ADR_CLASSES = values(AdrClass);
export const PACKING_GROUPS = values(PackingGroup);

/** Uppercase without spaces, dashes or dots: "hh-ab 123" and "HH AB123" are the same truck. */
export function normalizePlate(input: string): string {
  return input.toUpperCase().replace(/[\s\-.·_]/g, '');
}

/** E.164: `+` and 7 to 15 digits. A `00` prefix becomes `+`; separators are dropped. */
export function normalizePhone(input: string): string {
  const compact = input.replace(/[\s\-./()]/g, '');
  return compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
}

export const normalizeUnNumber = (input: string) => input.toUpperCase().replace(/\s/g, '');

export const plateSchema = z
  .string()
  .transform(normalizePlate)
  .pipe(z.string().regex(/^[\p{Lu}\p{N}]{2,15}$/u, 'Letters and digits, 2 to 15'));

export const phoneSchema = z
  .string()
  .transform(normalizePhone)
  .pipe(z.string().regex(/^\+[1-9]\d{6,14}$/, 'International format, for example +49 151 2345678'));

const unNumber = z
  .string()
  .transform(normalizeUnNumber)
  .pipe(z.string().regex(/^UN\d{4}$/, 'UN followed by four digits'));

const nullable = <T extends z.ZodType>(schema: T) => schema.nullable().default(null);

const reference = z.object({
  type: z.enum(ReferenceType),
  value: z.string().trim().min(1).max(35),
});

const loadUnit = z
  .object({
    type: z.enum(LoadUnitType),
    quantity: z.int().min(1).max(9999),
    stackable: z.boolean().optional(),
    label: z.string().trim().min(1).max(60).optional(),
  })
  .refine((u) => u.type !== LoadUnitType.other || u.label !== undefined, {
    message: 'Describe the load unit',
    path: ['label'],
  });

const dangerousGoodsItem = z.object({
  unNumber,
  // The tuple keeps the API description's order: zod keys a tuple by value, integer-like keys first.
  adrClass: z.enum(values(AdrClass)),
  packingGroup: z.enum(PackingGroup).optional(),
  quantity: z.number().positive().max(1_000_000).optional(),
  unit: z.enum(DangerousGoodsUnit).optional(),
  limitedQuantity: z.boolean().optional(),
});

const temperature = z
  .discriminatedUnion('controlled', [
    z.object({ controlled: z.literal(false) }),
    z.object({
      controlled: z.literal(true),
      minC: z.number().min(-40).max(40).optional(),
      maxC: z.number().min(-40).max(40).optional(),
    }),
  ])
  .refine(
    (t) => !t.controlled || t.minC === undefined || t.maxC === undefined || t.minC <= t.maxC,
    {
      message: 'Minimum is at most the maximum',
      path: ['maxC'],
    },
  );

export const AvisInput = z.object({
  references: z.array(reference).min(1).max(20),
  counterpartyName: z.string().trim().min(1).max(120),
  loadUnits: z.array(loadUnit).min(1).max(20),
  palletPositions: nullable(z.int().min(0).max(999)),
  grossWeightKg: nullable(
    z
      .number()
      .min(0)
      .max(9_999_999.9)
      .transform((kg) => Math.round(kg * 10) / 10),
  ),
  palletExchange: nullable(z.boolean()),
  vehicle: z
    .object({
      type: nullable(z.enum(VehicleType)),
      plate: nullable(plateSchema),
      plateCountry: nullable(z.string().regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2')),
      trailerPlate: nullable(plateSchema),
    })
    .default({ type: null, plate: null, plateCountry: null, trailerPlate: null }),
  driver: z
    .object({
      name: nullable(z.string().trim().min(1).max(120)),
      phone: nullable(phoneSchema),
      locale: nullable(z.enum(DriverLocale)),
    })
    .default({ name: null, phone: null, locale: null }),
  dangerousGoods: z
    .discriminatedUnion('present', [
      z.object({ present: z.literal(false) }),
      z.object({ present: z.literal(true), items: z.array(dangerousGoodsItem).min(1).max(20) }),
    ])
    .default({ present: false }),
  temperature: temperature.default({ controlled: false }),
  notes: nullable(z.string().trim().max(1000)),
});
export type AvisInput = z.input<typeof AvisInput>;
export type Avis = z.output<typeof AvisInput>;

/** The stored avis as the API returns it: the input fields plus the plate the gate saw. */
export type AvisView = Avis & { plateSeen: string | null };

export const totalLoadUnits = (avis: Pick<Avis, 'loadUnits'>) =>
  avis.loadUnits.reduce((sum, u) => sum + u.quantity, 0);

/** The settings that make avis fields required (AV-01), resolved for the booking's site. */
export interface AvisRules {
  requiredReferenceTypes: readonly ReferenceType[];
  requireGrossWeight: boolean;
  requireDriverPhone: boolean;
  requirePlate: boolean;
}

export interface AvisIssue {
  path: (string | number)[];
  code: 'custom';
  message: string;
}

/** Rules a schema cannot know: they come from site settings. Paths are relative to the avis. */
export function avisRuleIssues(avis: Avis, rules: AvisRules): AvisIssue[] {
  const issues: AvisIssue[] = [];
  const issue = (path: (string | number)[], message: string) =>
    issues.push({ path, code: ZodIssueCode.custom, message });
  for (const type of rules.requiredReferenceTypes) {
    if (!avis.references.some((r) => r.type === type)) {
      issue(['references'], `A reference of type ${type} is required`);
    }
  }
  if (rules.requireGrossWeight && avis.grossWeightKg === null) {
    issue(['grossWeightKg'], 'Gross weight is required');
  }
  if (rules.requireDriverPhone && avis.driver.phone === null) {
    issue(['driver', 'phone'], 'Driver phone is required');
  }
  if (rules.requirePlate && avis.vehicle.plate === null) {
    issue(['vehicle', 'plate'], 'Plate is required');
  }
  return issues;
}
