import * as z from 'zod';
import { values } from '../../values/define.ts';
import { DriverChannel } from '../driver/values.ts';
import { SafetyLocale } from './api.authoring.ts';
import { AckStatus } from './values.ts';

/**
 * Register filters (SF-03). They travel in a POST body because the driver name is a personal
 * search term (API conventions, "Requests").
 */
export const RegisterFilter = z.object({
  siteId: z.uuid().optional(),
  carrierId: z.uuid().optional(),
  driverName: z.string().trim().min(1).max(120).optional(),
  instructionId: z.uuid().optional(),
  versionId: z.uuid().optional(),
  status: z.enum(AckStatus).optional(),
});
export type RegisterFilter = z.infer<typeof RegisterFilter>;

export const RegisterSearchBody = RegisterFilter.extend({
  limit: z.int().min(1).max(200).default(50),
  cursor: z.string().max(200).optional(),
});
export type RegisterSearchBody = z.infer<typeof RegisterSearchBody>;

export const ACK_CHANNELS = values(DriverChannel);

export const RegisterItem = z.object({
  id: z.uuid(),
  completedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(),
  status: z.enum(AckStatus),
  driverName: z.string(),
  channel: z.enum(DriverChannel),
  locale: SafetyLocale,
  score: z.int().nullable(),
  attempts: z.int(),
  instruction: z.object({ id: z.uuid(), name: z.string() }),
  version: z.object({ id: z.uuid(), version: z.int() }),
  /** The visit it was completed for; `null` once retention deleted the booking. */
  booking: z.object({ id: z.uuid(), code: z.string(), carrierName: z.string() }).nullable(),
  carrierId: z.uuid().nullable(),
  site: z.object({ id: z.uuid(), name: z.string(), timeZone: z.string() }).nullable(),
});
export type RegisterItem = z.infer<typeof RegisterItem>;

export const RegisterPage = z.object({
  items: z.array(RegisterItem),
  nextCursor: z.string().nullable(),
});
export type RegisterPage = z.infer<typeof RegisterPage>;

/** The choices of the register's instruction, version and carrier filters (SF-03). */
export const RegisterFilterOptions = z.object({
  /** Every instruction with its non-draft versions, newest first; archived ones too. */
  instructions: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      versions: z.array(z.object({ id: z.uuid(), version: z.int() })),
    }),
  ),
  /** Carriers of the bookings that have acknowledgements in the register. */
  carriers: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
export type RegisterFilterOptions = z.infer<typeof RegisterFilterOptions>;
