import { TranslationState } from '@rampflow/shared/modules/safety/values';
import { DriverLocale, OrgKind } from '@rampflow/shared/values';
import type { TenantId } from '../../src/db/ids.ts';
import { loadEntitlements } from '../../src/kernel/access.ts';
import {
  createInstruction,
  getVersion,
  listInstructions,
  publishVersion,
  putContent,
} from '../../src/modules/safety/authoring/instructions.ts';
import type { VersionId } from '../../src/modules/safety/schema.ts';
import { findOrg, type SeedContext } from './context.ts';
import { ACME } from './core.ts';

export const DEMO_BRIEFING = 'Site safety rules';

export async function seed(ctx: SeedContext): Promise<void> {
  const tenantId = (await findOrg(ctx.db, OrgKind.tenant, ACME)) as TenantId | null;
  if (!tenantId) throw new Error(`${ACME} is missing; the core seed runs first`);
  if (await seedBriefing(ctx.db, tenantId)) ctx.log(`published ${DEMO_BRIEFING} for ${ACME}`);
}

/**
 * The demo briefing: one all-sites instruction from the platform template, Polish marked as
 * reviewed, published. A tenant that already has a briefing is left as it is.
 */
export async function seedBriefing(db: SeedContext['db'], tenantId: TenantId): Promise<boolean> {
  const now = new Date();
  const entitlements = await loadEntitlements(db, tenantId, now);
  if (!entitlements.modules.safety) return false;
  if ((await listInstructions(db, tenantId)).length > 0) return false;
  const actor = { tenantId, entitlements };
  const instruction = await createInstruction(db, {
    ...actor,
    body: { name: DEMO_BRIEFING, allSites: true, siteIds: [] },
  });
  const versionId = instruction.draft?.id as VersionId | undefined;
  if (!versionId) throw new Error('new instruction without a draft');
  const version = await getVersion(db, tenantId, versionId);
  const pl = version.content.find((c) => c.locale === DriverLocale.pl);
  if (pl) {
    const { locale: _locale, contentHash: _hash, ...body } = pl;
    await putContent(db, {
      ...actor,
      versionId,
      locale: DriverLocale.pl,
      body: { ...body, translation: TranslationState.reviewed },
    });
  }
  await publishVersion(db, { ...actor, versionId, materialChange: false, userId: null, now });
  return true;
}
