import type {
  OnboardingStepState,
  OnboardingView,
} from '@rampflow/shared/modules/core/api.onboarding';
import { tenantStatus } from '@rampflow/shared/modules/core/tenant-status';
import { OnboardingStep } from '@rampflow/shared/modules/core/values';
import { OrgKind, values } from '@rampflow/shared/values';
import { and, asc, eq, exists, isNull } from 'drizzle-orm';
import type { OrgId, TenantId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { dock, hall, org, site } from '../schema.ts';

/**
 * ON-02: the first dock activates the tenant. The update only matches while `activated_at` is
 * null, and the `tenant_update_activate` policy allows nothing else, so activation is one-way.
 */
export async function activateTenant(tx: Tx, tenantId: TenantId, now: Date): Promise<void> {
  await tx
    .update(org)
    .set({ activatedAt: now })
    .where(
      and(
        eq(org.id, tenantId as string as OrgId),
        eq(org.kind, OrgKind.tenant),
        isNull(org.activatedAt),
      ),
    );
}

/** ON-01: the three steps to the first dock, each with the site its link opens. */
export async function onboardingView(tx: Tx, tenantId: TenantId): Promise<OnboardingView> {
  const [tenant] = await tx
    .select({ activatedAt: org.activatedAt })
    .from(org)
    .where(eq(org.id, tenantId as string as OrgId));
  const activeSites = and(eq(site.tenantId, tenantId), eq(site.active, true));
  const [firstSite] = await tx
    .select({ id: site.id })
    .from(site)
    .where(activeSites)
    .orderBy(asc(site.createdAt), asc(site.id))
    .limit(1);
  const [siteWithHall] = await tx
    .select({ id: site.id })
    .from(site)
    .where(
      and(
        activeSites,
        exists(
          tx
            .select({ id: hall.id })
            .from(hall)
            .where(and(eq(hall.tenantId, tenantId), eq(hall.siteId, site.id))),
        ),
      ),
    )
    .orderBy(asc(site.createdAt), asc(site.id))
    .limit(1);
  const [anyDock] = await tx
    .select({ id: dock.id })
    .from(dock)
    .where(eq(dock.tenantId, tenantId))
    .limit(1);
  const steps: Record<OnboardingStep, OnboardingStepState> = {
    [OnboardingStep.site]: {
      id: OnboardingStep.site,
      done: firstSite !== undefined,
      siteId: firstSite?.id ?? null,
    },
    [OnboardingStep.hall]: {
      id: OnboardingStep.hall,
      done: siteWithHall !== undefined,
      siteId: firstSite?.id ?? null,
    },
    [OnboardingStep.dock]: {
      id: OnboardingStep.dock,
      done: anyDock !== undefined,
      siteId: siteWithHall?.id ?? null,
    },
  };
  const activatedAt = tenant?.activatedAt ?? null;
  return {
    status: tenantStatus({ activatedAt }),
    activatedAt: activatedAt?.toISOString() ?? null,
    steps: values(OnboardingStep).map((id) => steps[id]),
  };
}
