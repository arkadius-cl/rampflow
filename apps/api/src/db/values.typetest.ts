// Compile-time proof that one value set feeds zod, a Drizzle column and a check (ADR-0019).
import { BookingStatus } from '@rampflow/shared/modules/booking/values';
import { values } from '@rampflow/shared/values';
import { check, pgTable, text } from 'drizzle-orm/pg-core';
import * as z from 'zod';
import { oneOf } from './ids.ts';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const proof = <T extends true>() => undefined as unknown as T;

const sample = pgTable(
  'sample',
  { status: text('status', { enum: values(BookingStatus) }).notNull() },
  (t) => [check('sample_status_check', oneOf(t.status, values(BookingStatus)))],
);

export const column = proof<Equal<(typeof sample.$inferSelect)['status'], BookingStatus>>();
export const zodObject = proof<Equal<z.output<z.ZodEnum<typeof BookingStatus>>, BookingStatus>>();
const fromTuple = z.enum(values(BookingStatus));
export const zodTuple = proof<Equal<z.output<typeof fromTuple>, BookingStatus>>();
export const parsed = z.enum(BookingStatus).parse(BookingStatus.no_show) satisfies BookingStatus;
