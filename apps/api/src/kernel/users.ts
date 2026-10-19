import { inArray } from 'drizzle-orm';
import type { UserId } from '../db/ids.ts';
import type { Tx } from '../db/scope.ts';
import { appUser } from '../modules/core/schema.ts';

export interface UserDisplay {
  id: UserId;
  name: string;
  email: string;
  locale: string | null;
}

/**
 * Names and emails of the given users that the current scope may see (`app_user` RLS: self,
 * members of the scope's org, and for a tenant the members of its linked carriers).
 * Unknown or invisible ids are absent from the result.
 */
export async function userDisplay(
  tx: Tx,
  ids: readonly UserId[],
): Promise<Map<UserId, UserDisplay>> {
  if (ids.length === 0) return new Map();
  const rows = await tx
    .select({ id: appUser.id, name: appUser.name, email: appUser.email, locale: appUser.locale })
    .from(appUser)
    .where(inArray(appUser.id, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.id as UserId, r]));
}
