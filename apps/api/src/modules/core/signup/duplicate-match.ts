import { type TaxId, taxIdEquivalents } from '@rampflow/shared/modules/core/tax-id';
import { TaxIdType } from '@rampflow/shared/modules/core/values';
import { and, eq, exists, inArray, like, or, type SQL, sql } from 'drizzle-orm';
import type { Tx } from '../../../db/scope.ts';
import { appUser, membership, org } from '../schema.ts';
import { FREE_MAIL_DOMAINS } from './free-mail-domains.ts';

// RG-04, design decision 10, and PL-06's "Show matching tenants": the duplicate rule as one SQL
// condition over `org`, for the registration check and the platform's tenant list.

/** What a company is recognized by: its tax id and the email domains of its people. */
export interface DuplicateIdentity {
  taxId: TaxId | null;
  /** Lower-cased; free-mail domains are ignored. */
  emailDomains: readonly string[];
}

/**
 * An `org` row with an equivalent tax id (a W-IdNr counts for its VAT number), or with a member
 * at one of the identity's email domains. `undefined` when the identity has nothing to match.
 */
export function duplicateMatch(tx: Tx, identity: DuplicateIdentity): SQL | undefined {
  const equivalents = identity.taxId
    ? taxIdEquivalents(identity.taxId.type, identity.taxId.value)
    : [];
  const sameTaxId = or(
    ...equivalents.map((id) => and(eq(org.taxIdType, id.type), eq(org.taxIdValue, id.value))),
    ...equivalents
      .filter((id) => id.type === TaxIdType.eu_vat && id.value.startsWith('DE'))
      .map((id) => and(eq(org.taxIdType, TaxIdType.de_stn), like(org.taxIdValue, `${id.value}%`))),
  );
  const domains = identity.emailDomains.filter((d) => !FREE_MAIL_DOMAINS.has(d));
  const sameDomain =
    domains.length === 0
      ? undefined
      : exists(
          tx
            .select({ one: sql`1` })
            .from(membership)
            .innerJoin(appUser, eq(appUser.id, membership.userId))
            .where(
              and(
                eq(membership.orgId, org.id),
                inArray(sql`lower(split_part(${appUser.email}, '@', 2))`, domains),
              ),
            ),
        );
  return or(sameTaxId, sameDomain);
}
