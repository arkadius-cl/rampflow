import { ActorParty } from '@rampflow/shared/modules/booking/values';
import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgPolicy, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { citext, createdAt, instant, primaryId, type TenantId } from '../../db/ids.ts';
import { allow, always } from '../../db/rls.ts';
import { org } from '../core/schema.ts';

/** Transactional outbox (ADR-0010). Any scope enqueues; only the system worker reads. */
export const outboxMessage = pgTable(
  'outbox_message',
  {
    id: primaryId<'outbox_message'>(),
    tenantId: uuid('tenant_id')
      .$type<TenantId>()
      .references(() => org.id, { onDelete: 'cascade' }),
    template: text('template').notNull(),
    toEmail: citext('to_email').notNull(),
    locale: text('locale').notNull(),
    payload: jsonb('payload').notNull(),
    dedupeKey: text('dedupe_key').unique(),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: instant('next_attempt_at').notNull().defaultNow(),
    sentAt: instant('sent_at'),
    failedAt: instant('failed_at'),
    lastError: text('last_error'),
    createdAt: createdAt(),
  },
  (t) => [
    index('outbox_message_due_idx')
      .on(t.nextAttemptAt)
      .where(sql`${t.sentAt} is null and ${t.failedAt} is null`),
    index('outbox_message_tenant_id_idx').on(t.tenantId),
    pgPolicy('any_insert', {
      for: 'insert',
      withCheck: sql`(select app.party()) is not null and (${t.tenantId} is null or ${t.tenantId} = (select app.tenant_id()))`,
    }),
    allow(ActorParty.system, 'select', always),
    allow(ActorParty.system, 'update', always),
    allow(ActorParty.system, 'delete', always),
  ],
);
