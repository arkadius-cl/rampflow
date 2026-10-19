import { expect } from '@playwright/test';
import pg from 'pg';

// Owner-role fixtures for the carrier network specs (U7): site settings that TN-02's settings
// screen (U3) writes, package overrides that the platform screens (U3) write, and lookups.

let pool: pg.Pool | undefined;
function db(): pg.Pool {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error('MIGRATION_DATABASE_URL is not set; run through pnpm test:e2e');
  pool ??= new pg.Pool({ connectionString: url, max: 2 });
  return pool;
}

/** Writes one site setting, as the settings screen would. */
export async function setSiteSetting(o: {
  tenantId: string;
  siteId: string;
  key: 'booking.public_link_enabled' | 'booking.public_registration_mode';
  value: unknown;
  by: string;
}): Promise<void> {
  await db().query(
    `insert into setting_value (tenant_id, site_id, key, value, updated_by)
     values ($1, $2, $3, $4, $5)
     on conflict (tenant_id, site_id, key) do update set value = excluded.value`,
    [o.tenantId, o.siteId, o.key, JSON.stringify({ v: o.value }), o.by],
  );
}

/** Switches a feature off for one tenant, as a platform override would. */
export async function switchOff(tenantId: string, key: string, by: string): Promise<void> {
  await db().query(
    `insert into entitlement_override (tenant_id, key, value, updated_by)
     values ($1, $2, '{"v": false}', $3)`,
    [tenantId, key, by],
  );
}

/** The status of the carrier's link to the tenant, or `null` without a link. */
export async function linkStatus(tenantId: string, carrierId: string): Promise<string | null> {
  const { rows } = await db().query<{ status: string }>(
    'select status from tenant_carrier_link where tenant_id = $1 and carrier_id = $2',
    [tenantId, carrierId],
  );
  return rows[0]?.status ?? null;
}

/** The carrier org of a user, by email. */
export async function carrierOf(email: string): Promise<string | null> {
  const { rows } = await db().query<{ org_id: string }>(
    `select m.org_id from membership m join app_user u on u.id = m.user_id
     where u.email = $1 and m.org_kind = 'carrier'`,
    [email],
  );
  return rows[0]?.org_id ?? null;
}

const MAILPIT = `http://${process.env.SMTP_HOST ?? 'localhost'}:8025`;

/** The newest email to `to` whose subject matches, waiting for the outbox worker. */
export async function emailMatching(
  to: string,
  subject: RegExp,
): Promise<{ subject: string; text: string }> {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
        );
        const body = (await res.json()) as { messages: { ID: string; Subject: string }[] };
        id = body.messages.find((m) => subject.test(m.Subject))?.ID;
        return id !== undefined;
      },
      { timeout: 20_000, message: `an email to ${to} with subject ${subject}` },
    )
    .toBe(true);
  const message = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
    Subject: string;
    Text: string;
  };
  return { subject: message.Subject, text: message.Text };
}
