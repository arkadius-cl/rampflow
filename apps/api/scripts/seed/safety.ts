import type { Entitlements } from '@rampflow/shared';
import type { TenantId, UserId } from '../../src/db/ids.ts';
import type { Tx } from '../../src/db/scope.ts';
import {
  createInstruction,
  listInstructions,
  publishVersion,
} from '../../src/modules/safety/authoring/instructions.ts';

/**
 * Demo data of the safety module: one all-sites briefing from the platform template, published.
 * Runs in the tenant's scope; a tenant that already has a briefing is left as it is.
 */
export async function seedSafety(
  tx: Tx,
  ctx: { tenantId: TenantId; entitlements: Entitlements; userId: UserId | null; now: Date },
): Promise<void> {
  if (!ctx.entitlements.modules.safety) return;
  if ((await listInstructions(tx, ctx.tenantId)).length > 0) return;
  const instruction = await createInstruction(tx, {
    ...ctx,
    body: { name: 'Site safety rules', allSites: true, siteIds: [] },
  });
  if (!instruction.draft) throw new Error('new instruction without a draft');
  await publishVersion(tx, {
    ...ctx,
    versionId: instruction.draft.id as never,
    materialChange: false,
  });
}
