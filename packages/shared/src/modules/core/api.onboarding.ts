import type { OnboardingStep, TenantStatus } from './values.ts';

// Response of GET /api/t/:orgId/onboarding (ON-01, ON-02).

export interface OnboardingStepState {
  id: OnboardingStep;
  done: boolean;
  /** The site the step's link opens: the first active site, or the first one with a hall. */
  siteId: string | null;
}

export interface OnboardingView {
  status: TenantStatus;
  /** ISO 8601 UTC instant of the first dock, null while onboarding. */
  activatedAt: string | null;
  /** In the order of `OnboardingStep`. */
  steps: OnboardingStepState[];
}
