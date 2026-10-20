import { describe, expect, it } from 'vitest';
import { AvisInput, avisRuleIssues } from './avis.ts';
import { LoadUnitType, ReferenceType } from './values.ts';

const base = {
  references: [{ type: 'purchase_order', value: 'PO-1' }],
  counterpartyName: 'Lieferant GmbH',
  loadUnits: [{ type: 'eur_pallet', quantity: 12 }],
} as const;

const issuePaths = (input: unknown) => {
  const r = AvisInput.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.path);
};

describe('avis normalization (AV-01)', () => {
  it('stores plates uppercase without separators and phones as E.164', () => {
    const avis = AvisInput.parse({
      ...base,
      vehicle: { plate: 'hh-ab 1234', trailerPlate: 'wa 12.345' },
      driver: { phone: '0048 601 234-567' },
    });
    expect(avis.vehicle.plate).toBe('HHAB1234');
    expect(avis.vehicle.trailerPlate).toBe('WA12345');
    expect(avis.driver.phone).toBe('+48601234567');
  });

  it('rejects a phone without a country code at its path', () => {
    expect(issuePaths({ ...base, driver: { phone: '0151 2345678' } })).toEqual([
      ['driver', 'phone'],
    ]);
  });

  it('rejects UN123 and accepts UN1203 with class 3', () => {
    const goods = (unNumber: string) => ({
      ...base,
      dangerousGoods: { present: true, items: [{ unNumber, adrClass: '3' }] },
    });
    expect(issuePaths(goods('UN123'))).toEqual([['dangerousGoods', 'items', 0, 'unNumber']]);
    const ok = AvisInput.parse(goods('un 1203'));
    expect(ok.dangerousGoods).toEqual({
      present: true,
      items: [{ unNumber: 'UN1203', adrClass: '3' }],
    });
  });

  it('needs at least one reference and one load unit, and a label for "other"', () => {
    expect(
      issuePaths({
        ...base,
        references: [],
        loadUnits: [{ type: LoadUnitType.other, quantity: 1 }],
      }),
    ).toEqual([['references'], ['loadUnits', 0, 'label']]);
  });

  it('defaults the optional parts to null and "not present"', () => {
    const avis = AvisInput.parse(base);
    expect(avis).toMatchObject({
      grossWeightKg: null,
      vehicle: { type: null, plate: null, plateCountry: null, trailerPlate: null },
      driver: { name: null, phone: null, locale: null },
      dangerousGoods: { present: false },
      temperature: { controlled: false },
      notes: null,
    });
  });
});

describe('avis rules from settings', () => {
  const rules = {
    requiredReferenceTypes: [ReferenceType.delivery_note],
    requireGrossWeight: true,
    requireDriverPhone: true,
    requirePlate: true,
  };

  it('names every missing field by its path', () => {
    expect(avisRuleIssues(AvisInput.parse(base), rules).map((i) => i.path)).toEqual([
      ['references'],
      ['grossWeightKg'],
      ['driver', 'phone'],
      ['vehicle', 'plate'],
    ]);
  });

  it('passes a complete avis', () => {
    const avis = AvisInput.parse({
      ...base,
      references: [...base.references, { type: ReferenceType.delivery_note, value: 'LS-9' }],
      grossWeightKg: 12000.04,
      vehicle: { plate: 'HH AB 1' },
      driver: { phone: '+49 151 2345678' },
    });
    expect(avis.grossWeightKg).toBe(12000);
    expect(avisRuleIssues(avis, rules)).toEqual([]);
  });
});
