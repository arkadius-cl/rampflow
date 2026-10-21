import * as z from 'zod';
import { ZodIssueCode } from '../values/validation.ts';
import { closingTimeSchema, localTimeSchema } from './index.ts';

// Weekly opening windows of a site or resource (MD-01, MD-04). Weekday 1 is Monday (ISO 8601).

export const HoursRow = z
  .object({ weekday: z.int().min(1).max(7), opens: localTimeSchema, closes: closingTimeSchema })
  .refine((r) => r.opens < r.closes, { message: 'Opens before it closes', path: ['closes'] });
export type HoursRow = z.infer<typeof HoursRow>;

/** Up to ten windows a day that do not overlap; empty means "no own hours". */
export const WeeklyHours = z
  .array(HoursRow)
  .max(70)
  .superRefine((rows, ctx) => {
    rows.forEach((row, i) => {
      const overlaps = rows.some(
        (other, j) =>
          j < i &&
          other.weekday === row.weekday &&
          other.opens < row.closes &&
          row.opens < other.closes,
      );
      if (overlaps) {
        ctx.addIssue({ code: ZodIssueCode.custom, message: 'Overlaps another window', path: [i] });
      }
    });
  });
export type WeeklyHours = z.infer<typeof WeeklyHours>;
