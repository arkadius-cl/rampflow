// Bootstraps a platform admin, idempotently, as the owner role:
//   pnpm admin:create --email ops@example.com --name "Ops"
// Creates the platform org if missing, the user with a verified email, and the platform_admin
// membership. The user signs in by magic link (U2); no password is set here.
import { parseArgs } from 'node:util';
import { CliOptionType, DatabaseUrlVar } from '@rampflow/shared/values';
import pg from 'pg';
import { requireUrl } from './db-setup.ts';

const { values } = parseArgs({
  options: { email: { type: CliOptionType.string }, name: { type: CliOptionType.string } },
});
if (!values.email || !values.name) {
  console.error('usage: pnpm admin:create --email <address> --name <display name>');
  process.exit(2);
}

const client = new pg.Client({
  connectionString: requireUrl(DatabaseUrlVar.MIGRATION_DATABASE_URL).toString(),
});
await client.connect();
try {
  await client.query('begin');
  await client.query(
    `insert into org (kind, name) values ('platform', 'rampflow') on conflict do nothing`,
  );
  const { rows: orgs } = await client.query<{ id: string }>(
    `select id from org where kind = 'platform'`,
  );
  const { rows: users } = await client.query<{ id: string }>(
    `insert into app_user (email, name, email_verified_at) values ($1, $2, now())
     on conflict (email) do update set email_verified_at = coalesce(app_user.email_verified_at, now())
     returning id`,
    [values.email, values.name],
  );
  await client.query(
    `insert into membership (user_id, org_id, org_kind, role) values ($1, $2, 'platform', 'platform_admin')
     on conflict (user_id, org_id) do nothing`,
    [users[0]?.id, orgs[0]?.id],
  );
  await client.query('commit');
  console.log(`Platform admin ${values.email} (${users[0]?.id}) is ready.`);
} catch (e) {
  await client.query('rollback');
  throw e;
} finally {
  await client.end();
}
