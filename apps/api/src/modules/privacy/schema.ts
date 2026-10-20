import { PrivacyRequestKind } from '@rampflow/shared/modules/privacy/values';
import { values } from '@rampflow/shared/values';
import { check, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, oneOf, primaryId, type TenantId, type UserId } from '../../db/ids.ts';
import { tenantPolicies } from '../../db/rls.ts';
import { appUser, org } from '../core/schema.ts';

/** TN-06 requests: counts only, search terms are never stored. */
export const privacyRequestLog = pgTable(
  'privacy_request_log',
  {
    id: primaryId<'privacy_request_log'>(),
    tenantId: uuid('tenant_id')
      .$type<TenantId>()
      .notNull()
      .references(() => org.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: values(PrivacyRequestKind) }).notNull(),
    matchedBookings: integer('matched_bookings').notNull(),
    matchedAcknowledgements: integer('matched_acknowledgements').notNull(),
    actorUserId: uuid('actor_user_id')
      .$type<UserId>()
      .notNull()
      .references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('privacy_request_log_tenant_id_idx').on(t.tenantId),
    check('privacy_request_log_kind_check', oneOf(t.kind, values(PrivacyRequestKind))),
    ...tenantPolicies(t, { site: null, readers: [] }),
  ],
);
