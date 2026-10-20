import type { BookingStatus } from '@rampflow/shared/modules/booking/values';
import { type Attributes, type Path, setError } from 'fake-form';

interface SheetForm {
  startsAt: string;
  reason: string;
  address: { city: string; postalCode: string };
  references: { type: string }[];
}

export function keyOf(name: keyof SheetForm): boolean {
  return name === 'startsAt'; // → silent
}

export function libraryPath(): void {
  setError<SheetForm>('reason', { type: 'required' }); // → silent
}

function field(name: Path<SheetForm>): string {
  return name;
}

export function nestedPath(): string {
  return field('address.city'); // → silent
}

export function literalUnion(name: 'startsAt' | 'reason'): boolean {
  return name === 'reason'; // → create 'reason' | 'startsAt'
}

const BADGE: Record<BookingStatus, number> = {
  requested: 1,
  confirmed: 2,
  checked_in: 3,
  loading: 4,
  cancelled: 5,
  no_show: 6,
};

export function keyOfSetRecord(status: keyof typeof BADGE): boolean {
  return status === 'confirmed'; // → BookingStatus.confirmed
}

interface Catalog {
  validation: { required: string; too_long: string };
}
type MessageKey = keyof Catalog['validation'];

export function aliasOfKeyOf(): MessageKey {
  return 'too_long'; // → silent
}

interface Element {
  id: string;
}

function input(o: { inputMode?: Attributes<Element>['inputMode'] }): string {
  return o.inputMode ?? '';
}

export function libraryProperty(): string {
  return input({ inputMode: 'decimal' }); // → silent
}
