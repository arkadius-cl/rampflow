import { randomUUID } from 'node:crypto';
import { Text } from '@react-email/components';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../test/db.ts';
import { type World, world } from '../../test/world.ts';
import { type TenantId, wrapJson } from '../db/ids.ts';
import { type Scope, withScope } from '../db/scope.ts';
import { entitlementOverride } from '../modules/core/schema.ts';
import { outboxMessage } from '../modules/notify/schema.ts';
import { loadAccess } from './access.ts';
import { systemClock } from './clock.ts';
import { EmailLayout } from './email-layout.tsx';
import { type Job, runJobTick } from './jobs.ts';
import { type Mailer, smtpMailer } from './mailer.ts';
import {
  deliverOutbox,
  type EmailTemplate,
  enqueueEmail,
  retryDelayMs,
  type TemplateLoader,
} from './outbox.ts';
import { deriveToken } from './tokens.ts';

declare module './outbox.ts' {
  interface EmailTemplates {
    'core.probe': { authTokenId: string };
    'booking.probe': { bookingId: string };
  }
}

const MAILPIT = `http://${process.env.SMTP_HOST ?? 'localhost'}:8025`;

const probe: EmailTemplate<{ authTokenId: string }> = {
  category: 'account',
  render: (payload) => ({
    subject: 'Your sign-in link',
    body: (
      <EmailLayout lang="en" preview="Sign in" footer="rampflow">
        <Text>{`https://rampflow.test/auth/magic#${deriveToken('magic_link', payload.authTokenId)}`}</Text>
      </EmailLayout>
    ),
  }),
  example: { authTokenId: '00000000-0000-0000-0000-000000000000' },
};
const bookingProbe: EmailTemplate<{ bookingId: string }> = {
  category: 'booking',
  render: (p) => ({ subject: `Booking ${p.bookingId}`, body: <Text>{p.bookingId}</Text> }),
  example: { bookingId: '00000000-0000-0000-0000-000000000000' },
};
const templates: TemplateLoader = async (id) => {
  if (id === 'core.probe') return probe as EmailTemplate<unknown>;
  if (id === 'booking.probe') return bookingProbe as EmailTemplate<unknown>;
  throw new Error(`no template ${id}`);
};

let w: World;
beforeAll(async () => {
  w = await world();
});

const tenantScope = (): Scope => ({
  party: 'tenant',
  tenantId: w.A.tenantId,
  siteIds: 'all',
  actor: { kind: 'user', userId: w.A.users.dispatcher.id, role: 'dispatcher' },
});

const rowsTo = (to: string) =>
  ownerDb().select().from(outboxMessage).where(eq(outboxMessage.toEmail, to));

function outboxJob(mailer: Mailer): Job {
  return {
    name: `outbox-test-${randomUUID()}`,
    everySeconds: null,
    run: (ctx) => deliverOutbox({ ...ctx, mailer, loadTemplate: templates }),
  };
}

async function mailpitMessagesTo(to: string): Promise<{ ID: string; Subject: string }[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  const body = (await res.json()) as { messages: { ID: string; Subject: string }[] };
  return body.messages;
}

const enqueueProbe = (to: string, tenantId: TenantId | null, extra: { dedupeKey?: string } = {}) =>
  withScope({ party: 'anonymous' }, (tx) =>
    enqueueEmail(
      tx,
      {
        template: 'core.probe',
        to,
        locale: 'en',
        payload: { authTokenId: randomUUID() },
        tenantId,
        ...extra,
      },
      null,
      templates,
    ),
  );

describe('enqueueEmail', () => {
  it('leaves no outbox row when the transaction rolls back', async () => {
    const to = `rollback-${randomUUID()}@outbox.test`;
    await expect(
      withScope({ party: 'anonymous' }, async (tx) => {
        await enqueueEmail(
          tx,
          {
            template: 'core.probe',
            to,
            locale: 'en',
            payload: { authTokenId: randomUUID() },
            tenantId: null,
          },
          null,
          templates,
        );
        throw new Error('the business write failed');
      }),
    ).rejects.toThrow('the business write failed');
    expect(await rowsTo(to)).toEqual([]);
  });

  it('enqueues a duplicate dedupe_key once', async () => {
    const to = `dedupe-${randomUUID()}@outbox.test`;
    const dedupeKey = `reminder:${randomUUID()}`;
    expect(await enqueueProbe(to, null, { dedupeKey })).toBe('enqueued');
    expect(await enqueueProbe(to, null, { dedupeKey })).toBe('duplicate');
    expect(await rowsTo(to)).toHaveLength(1);
  });

  it('skips booking emails while notify.email is off and always sends account emails', async () => {
    const to = `gate-${randomUUID()}@outbox.test`;
    const send = () =>
      withScope(tenantScope(), async (tx) => {
        const { entitlements } = await loadAccess(tx, tenantScope(), systemClock);
        return Promise.all([
          enqueueEmail(
            tx,
            {
              template: 'booking.probe',
              to,
              locale: 'de',
              payload: { bookingId: w.A.bookings.own.id },
              tenantId: w.A.tenantId,
            },
            entitlements,
            templates,
          ),
          enqueueEmail(
            tx,
            {
              template: 'core.probe',
              to,
              locale: 'de',
              payload: { authTokenId: randomUUID() },
              tenantId: w.A.tenantId,
            },
            entitlements,
            templates,
          ),
        ]);
      });
    expect(await send()).toEqual(['enqueued', 'enqueued']);
    await ownerDb()
      .insert(entitlementOverride)
      .values({
        tenantId: w.A.tenantId,
        key: 'notify.email',
        value: wrapJson(false),
        updatedBy: w.platformAdmin.id,
      });
    expect(await send()).toEqual(['skipped', 'enqueued']);
    await ownerDb()
      .delete(entitlementOverride)
      .where(eq(entitlementOverride.tenantId, w.A.tenantId));
  });

  it('stores row ids, never the token a link carries', async () => {
    const to = `token-${randomUUID()}@outbox.test`;
    const authTokenId = randomUUID();
    await withScope({ party: 'anonymous' }, (tx) =>
      enqueueEmail(
        tx,
        { template: 'core.probe', to, locale: 'en', payload: { authTokenId }, tenantId: null },
        null,
        templates,
      ),
    );
    const token = deriveToken('magic_link', authTokenId);
    expect(JSON.stringify(await rowsTo(to))).not.toContain(token);
  });
});

describe('outbox worker', () => {
  it('delivers to Mailpit, marks the row sent and drops its payload', async () => {
    const to = `deliver-${randomUUID()}@outbox.test`;
    const authTokenId = randomUUID();
    await withScope({ party: 'anonymous' }, (tx) =>
      enqueueEmail(
        tx,
        { template: 'core.probe', to, locale: 'en', payload: { authTokenId }, tenantId: null },
        null,
        templates,
      ),
    );
    const tick = await runJobTick(outboxJob(smtpMailer()), {
      clock: systemClock,
      mailer: smtpMailer(),
    });
    expect(tick).toMatchObject({ ran: true, stats: { sent: expect.any(Number) } });
    const [row] = await rowsTo(to);
    expect(row).toMatchObject({ attempts: 1, lastError: null, payload: {} });
    expect(row?.sentAt).toBeInstanceOf(Date);
    const messages = await mailpitMessagesTo(to);
    expect(messages.map((m) => m.Subject)).toEqual(['Your sign-in link']);
    const message = (await (
      await fetch(`${MAILPIT}/api/v1/message/${messages[0]?.ID}`)
    ).json()) as { Text: string };
    expect(message.Text).toContain(deriveToken('magic_link', authTokenId));
  });

  it('schedules a retry when the transport fails, without addresses in last_error', async () => {
    const to = `retry-${randomUUID()}@outbox.test`;
    await enqueueProbe(to, null);
    const failing: Mailer = {
      send: async (mail) => {
        throw new Error(`550 mailbox ${mail.to} unavailable`);
      },
    };
    const before = Date.now();
    await runJobTick(outboxJob(failing), { clock: systemClock, mailer: failing });
    const [row] = await rowsTo(to);
    expect(row).toMatchObject({ attempts: 1, sentAt: null, failedAt: null });
    expect(row?.lastError).toBe('550 mailbox <address> unavailable');
    expect(row?.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + retryDelayMs(1) - 1000);
    expect(await mailpitMessagesTo(to)).toEqual([]);
  });
});
