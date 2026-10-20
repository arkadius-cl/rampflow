import { createServerI18n } from '@rampflow/i18n/server';
import type { Entitlements } from '@rampflow/shared';
import { EmailCategory, SystemActorName } from '@rampflow/shared/values';
import { render as renderEmail } from '@react-email/render';
import { and, asc, eq, isNull, lte } from 'drizzle-orm';
import type { TFunction } from 'i18next';
import type { ReactElement } from 'react';
import type { TenantId } from '../db/ids.ts';
import { asScope, type Tx } from '../db/scope.ts';
import { currentLogoUrl } from '../modules/brand/logo/logo.ts';
import { org } from '../modules/core/schema.ts';
import { outboxMessage } from '../modules/notify/schema.ts';
import { loadEntitlements } from './access.ts';
import type { Clock } from './clock.ts';
import { type EmailBrand, withBrand } from './email-layout.tsx';
import { env } from './env.ts';
import type { Mailer } from './mailer.ts';
import { systemActor, systemScope } from './system.ts';

/**
 * Payload type per `EmailTemplate` id `<module>.<name>`. Each template file adds its entry:
 *   declare module '../../../kernel/outbox.ts' { interface EmailTemplates { 'core.invitation': P } }
 * Payloads carry row ids, never tokens or links: the template derives a link at send time with
 * `deriveToken` (kernel/tokens.ts), so the outbox holds nothing a database dump could replay.
 */
// biome-ignore lint/suspicious/noEmptyInterface: filled by declaration merging in template files
export interface EmailTemplates {}
export type TemplateId = keyof EmailTemplates & string;

/** What `modules/<module>/emails/<name>.tsx` exports. */
export interface EmailTemplateModule<P> {
  category: EmailCategory;
  render(payload: P, t: TFunction): { subject: string; body: ReactElement };
  example: P;
}

export interface OutboxEmail<K extends TemplateId> {
  template: K;
  to: string;
  locale: string;
  payload: EmailTemplates[K];
  /** `null` for account emails without a tenant (magic links, resets). */
  tenantId: TenantId | null;
  dedupeKey?: string;
}

export type EnqueueResult = 'enqueued' | 'duplicate' | 'skipped';

export type TemplateLoader = (id: string) => Promise<EmailTemplateModule<unknown>>;

const TEMPLATE_ID = /^([a-z]+)\.([a-z0-9-]+)$/;

/** Loads `modules/<module>/emails/<name>.tsx` for template id `<module>.<name>`. */
export const loadTemplateFile: TemplateLoader = async (id) => {
  const match = TEMPLATE_ID.exec(id);
  if (!match) throw new Error(`Invalid template id ${id}`);
  const mod: Partial<EmailTemplateModule<unknown>> = await import(
    `../modules/${match[1]}/emails/${match[2]}.tsx`
  );
  if (
    typeof mod.render !== 'function' ||
    (mod.category !== EmailCategory.account && mod.category !== EmailCategory.booking)
  ) {
    throw new Error(`Template ${id} must export category and render`);
  }
  return mod as EmailTemplateModule<unknown>;
};

/**
 * Inserts one outbox row in the caller's transaction, so a rollback sends nothing.
 * A `booking` template is skipped while `notify.email` is off; a repeated `dedupeKey`
 * enqueues once. Works under every scope: the insert needs no SELECT policy.
 */
export async function enqueueEmail<K extends TemplateId>(
  tx: Tx,
  email: OutboxEmail<K>,
  entitlements: Entitlements | null,
  loadTemplate: TemplateLoader = loadTemplateFile,
): Promise<EnqueueResult> {
  const template = await loadTemplate(email.template);
  if (template.category === EmailCategory.booking && !entitlements?.features['notify.email'])
    return 'skipped';
  const result = await tx
    .insert(outboxMessage)
    .values({
      tenantId: email.tenantId,
      template: email.template,
      toEmail: email.to,
      locale: email.locale,
      payload: email.payload,
      dedupeKey: email.dedupeKey ?? null,
    })
    .onConflictDoNothing();
  return result.rowCount === 1 ? 'enqueued' : 'duplicate';
}

export const OUTBOX_BATCH = 20;
export const OUTBOX_MAX_ATTEMPTS = 8;
export const retryDelayMs = (attempts: number) => 2 ** attempts * 30_000;

const ADDRESS = /[^\s<>"'@]+@[^\s<>"'@]+/g;
/** SMTP errors echo recipients; the outbox keeps no address outside `to_email`. */
const scrub = (e: unknown) =>
  String(e instanceof Error ? e.message : e)
    .replace(ADDRESS, '<address>')
    .slice(0, 500);

export interface OutboxStats extends Record<string, number> {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
}

export interface DeliverOptions {
  tx: Tx;
  clock: Clock;
  mailer: Mailer;
  loadTemplate?: TemplateLoader;
}

/**
 * The tenant's name and absolute logo URL while `brand.logo` is on (TN-05), read as the tenant:
 * the system scope sees no logo or entitlements.
 */
function emailBrand(tx: Tx, tenantId: TenantId, now: Date): Promise<EmailBrand | null> {
  const scope = {
    party: 'tenant',
    tenantId,
    siteIds: [],
    actor: systemActor(SystemActorName.outbox),
  } as const;
  return asScope(tx, scope, async (inner) => {
    const entitlements = await loadEntitlements(inner, tenantId, now);
    const logoUrl = await currentLogoUrl(inner, tenantId, entitlements, env.APP_ORIGIN);
    if (!logoUrl) return null;
    const [tenant] = await inner.select({ name: org.name }).from(org).where(eq(org.id, tenantId));
    return { tenantName: tenant?.name ?? '', logoUrl };
  });
}

/**
 * One worker tick (ADR-0010) inside the job's transaction: claim due rows with `skip locked`,
 * render, send, mark. A sent row keeps no payload.
 */
export function deliverOutbox({
  tx,
  clock,
  mailer,
  loadTemplate = loadTemplateFile,
}: DeliverOptions): Promise<OutboxStats> {
  return asScope(tx, systemScope(SystemActorName.outbox), async () => {
    const now = clock.now();
    const due = await tx
      .select()
      .from(outboxMessage)
      .where(
        and(
          isNull(outboxMessage.sentAt),
          isNull(outboxMessage.failedAt),
          lte(outboxMessage.nextAttemptAt, now),
        ),
      )
      .orderBy(asc(outboxMessage.nextAttemptAt))
      .limit(OUTBOX_BATCH)
      .for('update', { skipLocked: true });

    const stats: OutboxStats = { claimed: due.length, sent: 0, retried: 0, failed: 0 };
    for (const row of due) {
      const attempts = row.attempts + 1;
      try {
        const template = await loadTemplate(row.template);
        const i18n = await createServerI18n(row.locale);
        const ns = row.template.split('.')[0] ?? 'core';
        const rendered = template.render(row.payload, i18n.getFixedT(row.locale, ns));
        const body = withBrand(
          rendered.body,
          row.tenantId ? await emailBrand(tx, row.tenantId, now) : null,
        );
        const [html, text] = await Promise.all([
          renderEmail(body),
          renderEmail(body, { plainText: true }),
        ]);
        await mailer.send({ to: row.toEmail, subject: rendered.subject, html, text });
        await tx
          .update(outboxMessage)
          .set({ sentAt: now, attempts, lastError: null, payload: {} })
          .where(eq(outboxMessage.id, row.id));
        stats.sent++;
      } catch (e) {
        const failed = attempts >= OUTBOX_MAX_ATTEMPTS;
        await tx
          .update(outboxMessage)
          .set({
            attempts,
            lastError: scrub(e),
            failedAt: failed ? now : null,
            nextAttemptAt: new Date(now.getTime() + retryDelayMs(attempts)),
          })
          .where(eq(outboxMessage.id, row.id));
        if (failed) {
          stats.failed++;
          console.error(
            `outbox: message ${row.id} (${row.template}) failed after ${attempts} attempts`,
          );
        } else {
          stats.retried++;
        }
      }
    }
    return stats;
  });
}
