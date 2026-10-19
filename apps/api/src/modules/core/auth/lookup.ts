import { sql } from 'drizzle-orm';
import type { UserId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';

export interface AccountByEmail {
  id: UserId;
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
  disabledAt: Date | null;
}

/**
 * The account of an email address before anyone is signed in, through the security-definer
 * function `app.user_by_email`, which answers only the anonymous, token and public parties.
 */
export async function accountByEmail(tx: Tx, email: string): Promise<AccountByEmail | null> {
  const { rows } = await tx.execute<{
    id: string;
    password_hash: string | null;
    email_verified_at: string | Date | null;
    disabled_at: string | Date | null;
  }>(sql`select * from app.user_by_email(${email})`);
  const row = rows[0];
  if (!row) return null;
  const instant = (v: string | Date | null) => (v === null ? null : new Date(v));
  return {
    id: row.id as UserId,
    passwordHash: row.password_hash,
    emailVerifiedAt: instant(row.email_verified_at),
    disabledAt: instant(row.disabled_at),
  };
}
