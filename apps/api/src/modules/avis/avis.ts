import {
  type Avis,
  type AvisRules,
  type AvisView,
  avisRuleIssues,
} from '@rampflow/shared/modules/avis/avis';
import { eq } from 'drizzle-orm';
import type { BookingId, CarrierId, SiteId, TenantId, UserId } from '../../db/ids.ts';
import type { Tx } from '../../db/scope.ts';
import type { Access } from '../../kernel/access.ts';
import { ApiError } from '../../kernel/errors.ts';
import { referenceTaken } from '../booking/lifecycle/elevated.ts';
import { avis, avisReference } from './schema.ts';

// The avis repository (AV-01, AV-02): one row per booking plus its references.

export interface AvisOwner {
  id: BookingId;
  tenantId: TenantId;
  siteId: SiteId;
  carrierId: CarrierId | null;
}

type AvisRow = typeof avis.$inferSelect;

const normRef = (value: string) => value.trim().toUpperCase();

/** The view of a stored avis, in the field order of `AvisInput`. */
function viewOf(row: AvisRow, refs: { type: string; value: string }[]): AvisView {
  return {
    references: refs.map((r) => ({
      type: r.type as Avis['references'][number]['type'],
      value: r.value,
    })),
    counterpartyName: row.counterpartyName,
    loadUnits: row.loadUnits as Avis['loadUnits'],
    palletPositions: row.palletPositions,
    grossWeightKg: row.grossWeightKg === null ? null : Number(row.grossWeightKg),
    palletExchange: row.palletExchange,
    vehicle: {
      type: row.vehicleType as Avis['vehicle']['type'],
      plate: row.plate,
      plateCountry: row.plateCountry,
      trailerPlate: row.trailerPlate,
    },
    driver: {
      name: row.driverName,
      phone: row.driverPhone,
      locale: row.driverLocale as Avis['driver']['locale'],
    },
    dangerousGoods: row.dangerousGoods as Avis['dangerousGoods'],
    temperature: row.temperature as Avis['temperature'],
    notes: row.notes,
    plateSeen: row.plateSeen,
  };
}

export async function readAvis(tx: Tx, bookingId: BookingId): Promise<AvisView | null> {
  const [row] = await tx.select().from(avis).where(eq(avis.bookingId, bookingId));
  if (!row) return null;
  const refs = await tx
    .select({ type: avisReference.type, value: avisReference.value })
    .from(avisReference)
    .where(eq(avisReference.bookingId, bookingId))
    .orderBy(avisReference.createdAt, avisReference.id);
  return viewOf(row, refs);
}

function columnsOf(a: Avis) {
  return {
    counterpartyName: a.counterpartyName,
    loadUnits: a.loadUnits,
    palletPositions: a.palletPositions,
    grossWeightKg: a.grossWeightKg === null ? null : a.grossWeightKg.toFixed(1),
    palletExchange: a.palletExchange,
    vehicleType: a.vehicle.type,
    plate: a.vehicle.plate,
    plateCountry: a.vehicle.plateCountry,
    trailerPlate: a.vehicle.trailerPlate,
    driverName: a.driver.name,
    driverPhone: a.driver.phone,
    driverLocale: a.driver.locale,
    dangerousGoods: a.dangerousGoods,
    temperature: a.temperature,
    notes: a.notes,
  };
}

/** Inserts the avis of a new booking, or replaces the fields of an existing one. */
export async function writeAvis(
  tx: Tx,
  owner: AvisOwner,
  a: Avis,
  o: { updatedBy: UserId | null; now: Date; plateSeen?: string | null },
): Promise<void> {
  const columns = {
    ...columnsOf(a),
    updatedBy: o.updatedBy,
    updatedAt: o.now,
    ...(o.plateSeen !== undefined ? { plateSeen: o.plateSeen } : {}),
  };
  await tx
    .insert(avis)
    .values({
      bookingId: owner.id,
      tenantId: owner.tenantId,
      siteId: owner.siteId,
      carrierId: owner.carrierId,
      ...columns,
    })
    .onConflictDoUpdate({ target: avis.bookingId, set: columns });
  await tx.delete(avisReference).where(eq(avisReference.bookingId, owner.id));
  for (const r of a.references) {
    await tx.insert(avisReference).values({
      bookingId: owner.id,
      tenantId: owner.tenantId,
      siteId: owner.siteId,
      carrierId: owner.carrierId,
      type: r.type,
      value: r.value,
      valueNorm: normRef(r.value),
    });
  }
}

export async function setPlateSeen(tx: Tx, bookingId: BookingId, plate: string): Promise<void> {
  await tx.update(avis).set({ plateSeen: plate }).where(eq(avis.bookingId, bookingId));
}

/**
 * YD-03: a truck turned away at the gate without a booking leaves only the plate the gate saw.
 * Its avis row has no counterparty and no load units.
 */
export async function recordPlateOnly(
  tx: Tx,
  owner: AvisOwner,
  plate: string,
  o: { updatedBy: UserId | null; now: Date },
): Promise<void> {
  await tx.insert(avis).values({
    bookingId: owner.id,
    tenantId: owner.tenantId,
    siteId: owner.siteId,
    carrierId: owner.carrierId,
    counterpartyName: '',
    loadUnits: [],
    plateSeen: plate,
    updatedBy: o.updatedBy,
    updatedAt: o.now,
  });
}

/** JSON with sorted keys and references in a fixed order: jsonb does not keep key order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

const comparable = (a: Avis) => ({
  ...a,
  references: [...a.references].sort((x, y) =>
    `${x.type}:${x.value}`.localeCompare(`${y.type}:${y.value}`),
  ),
});

/** Top-level avis fields whose value differs (event `avis_updated` names fields, never values). */
export function changedFields(before: Avis, after: Avis): (keyof Avis)[] {
  const b = comparable(before);
  const a = comparable(after);
  return (Object.keys(a) as (keyof Avis)[]).filter((k) => canonical(b[k]) !== canonical(a[k]));
}

export async function avisRules(access: Access, siteId: SiteId): Promise<AvisRules> {
  return {
    requiredReferenceTypes: (await access.setting('avis.required_reference_types', siteId)).value,
    requireGrossWeight: (await access.setting('avis.require_gross_weight', siteId)).value,
    requireDriverPhone: (await access.setting('avis.require_driver_phone', siteId)).value,
    requirePlate: (await access.setting('booking.require_plate', siteId)).value,
  };
}

/**
 * The settings rules (422 with paths under `avis`) and `avis.unique_references` (409
 * `duplicate_reference`). Call after the capacity lock, so two creates cannot both pass.
 */
export async function checkAvis(
  tx: Tx,
  access: Access,
  owner: Pick<AvisOwner, 'tenantId' | 'siteId'> & { id: BookingId | null },
  a: Avis,
): Promise<void> {
  const issues = avisRuleIssues(a, await avisRules(access, owner.siteId));
  if (issues.length > 0) {
    throw new ApiError('validation_failed', 'Invalid json', {
      issues: issues.map((i) => ({ ...i, path: ['avis', ...i.path] })),
    });
  }
  if (!(await access.setting('avis.unique_references', owner.siteId)).value) return;
  const taken = await referenceTaken(tx, {
    tenantId: owner.tenantId,
    siteId: owner.siteId,
    references: a.references.map((r) => ({ type: r.type, valueNorm: normRef(r.value) })),
    excludeBookingId: owner.id,
  });
  if (taken) {
    throw new ApiError('conflict', 'A reference is already booked', {
      reason: 'duplicate_reference',
    });
  }
}
