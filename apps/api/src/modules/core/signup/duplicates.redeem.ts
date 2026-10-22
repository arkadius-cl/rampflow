import { OrgKind } from '@rampflow/shared/values';
import { and, eq, ne } from 'drizzle-orm';
import { asScope, type Tx } from '../../../db/scope.ts';
import { platformSystemScope } from '../../../kernel/system.ts';
import type { tenantSignup } from '../schema.signup.ts';
import { org } from '../schema.ts';
import { emailDomain } from './disposable-domains.ts';
import { duplicateMatch } from './duplicate-match.ts';

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
  const match = duplicateMatch(tx, {
    taxId: { type: signup.taxIdType, value: signup.taxIdValue },
    emailDomains: [emailDomain(signup.email)],
  });
  const notItself = signup.tenantId ? ne(org.id, signup.tenantId) : undefined;
  return asScope(tx, platformSystemScope, async (inner) => {
    const [hit] = await inner
      .select({ id: org.id })
      .from(org)
      .where(and(eq(org.kind, OrgKind.tenant), notItself, match))
      .limit(1);
    return hit !== undefined;
  });
}
