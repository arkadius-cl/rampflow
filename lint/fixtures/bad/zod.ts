import * as z from 'zod';
import { BookingStatus } from './sets.ts';

export const status = z.enum(['requested', 'confirmed']); // expect: zod-enum
export const mixed = z.enum([BookingStatus.requested, 'confirmed']); // expect: zod-enum
export const kind = z.literal('booking.confirmed'); // expect: zod-literal
export const event = z.object({ type: z.literal(`booking.cancelled`) }); // expect: zod-literal
