import { taxIdEquivalents } from '@rampflow/shared/modules/core/tax-id';
import { TaxIdType } from '@rampflow/shared/modules/core/values';
import { OrgKind } from '@rampflow/shared/values';
import { and, eq, exists, like, ne, or, type SQL, sql } from 'drizzle-orm';
import { asScope, type Tx } from '../../../db/scope.ts';
import { platformSystemScope } from '../../../kernel/system.ts';
import type { tenantSignup } from '../schema.signup.ts';
import { appUser, membership, org } from '../schema.ts';
import { emailDomain } from './disposable-domains.ts';
import { FREE_MAIL_DOMAINS } from './free-mail-domains.ts';

// RG-04, design decision 10: whether another tenant may be the same company. Reads across
// tenants as the platform and answers only a boolean, so nothing about that tenant leaks.

type SignupRow = typeof tenantSignup.$inferSelect;

/**
 * Another tenant with an equivalent tax id (a W-IdNr counts for its VAT number), or with a
 * member at the registration's email domain unless that is a free-mail domain. The tenant the
 * registration created, if any, is never its own duplicate.
 */
export function possibleDuplicate(
  tx: Tx,
  signup: Pick<SignupRow, 'email' | 'taxIdType' | 'taxIdValue' | 'tenantId'>,
): Promise<boolean> {
  const equivalents = taxIdEquivalents(signup.taxIdType, signup.taxIdValue);
  const sameTaxId = or(
    ...equivalents.map((id) => and(eq(org.taxIdType, id.type), eq(org.taxIdValue, id.value))),
    ...equivalents
      .filter((id) => id.type === TaxIdType.eu_vat && id.value.startsWith('DE'))
      .map((id) => and(eq(org.taxIdType, TaxIdType.de_stn), like(org.taxIdValue, `${id.value}%`))),
  );
  const domain = emailDomain(signup.email);
  const sameDomain: SQL | undefined = FREE_MAIL_DOMAINS.has(domain)
    ? undefined
    : exists(
        tx
          .select({ one: sql`1` })
          .from(membership)
          .innerJoin(appUser, eq(appUser.id, membership.userId))
          .where(
            and(
              eq(membership.orgId, org.id),
              sql`lower(split_part(${appUser.email}, '@', 2)) = ${domain}`,
            ),
          ),
      );
  const notItself = signup.tenantId ? ne(org.id, signup.tenantId) : undefined;
  return asScope(tx, platformSystemScope, async (inner) => {
    const [hit] = await inner
      .select({ id: org.id })
      .from(org)
      .where(and(eq(org.kind, OrgKind.tenant), notItself, or(sameTaxId, sameDomain)))
      .limit(1);
    return hit !== undefined;
  });
}
