import { ApiSection } from '@rampflow/shared/values';

/**
 * The sections of docs/reference/api-routes.md and their router files, relative to apps/api/src.
 * Sections do not follow modules (`core/sites` is master data), so the map is written by hand.
 */
export const SECTIONS = {
  [ApiSection.auth]: [
    'app.ts',
    'modules/core/auth/routes.anonymous.ts',
    'modules/core/me/routes.user.ts',
    'modules/core/invitations/routes.public.ts',
    'modules/core/context/routes.tenant.ts',
    'modules/core/context/routes.carrier.ts',
    'modules/core/context/routes.platform.ts',
  ],
  [ApiSection.platform]: ['modules/core/platform/routes.platform.ts'],
  [ApiSection.tenant]: [
    'modules/core/staff/routes.tenant.ts',
    'modules/core/settings/routes.tenant.ts',
    'modules/core/carrier-users/routes.carrier.ts',
    'modules/brand/logo/routes.tenant.ts',
    'modules/brand/logo/routes.public.ts',
  ],
  [ApiSection.master_data]: [
    'modules/core/sites/routes.tenant.ts',
    'modules/booking/capacity/routes.tenant.ts',
  ],
  [ApiSection.safety]: [
    'modules/safety/authoring/routes.tenant.ts',
    'modules/safety/register/routes.tenant.ts',
  ],
  [ApiSection.bookings]: ['modules/booking/staff/routes.tenant.ts'],
  [ApiSection.carriers]: [
    'modules/booking/carriers/routes.tenant.ts',
    'modules/booking/carriers/routes.carrier.ts',
    'modules/booking/carriers/routes.public.ts',
    'modules/booking/registration/routes.public.ts',
  ],
  [ApiSection.portal]: [
    'modules/booking/portal/routes.carrier.ts',
    'modules/booking/portal/routes.carrier-at-tenant.ts',
  ],
  [ApiSection.yard]: ['modules/yard/routes.tenant.ts'],
  [ApiSection.driver]: [
    'modules/driver/session/routes.driver.ts',
    'modules/driver/session/routes.public.ts',
    'modules/driver/view/routes.driver.ts',
    'modules/safety/driver/routes.driver.ts',
  ],
  [ApiSection.reports]: ['modules/report/kpi/routes.tenant.ts'],
  [ApiSection.privacy]: ['modules/privacy/requests/routes.tenant.ts'],
} as const satisfies Record<ApiSection, readonly string[]>;

export type Section = ApiSection;

const BY_FILE = new Map<string, Section>(
  Object.entries(SECTIONS).flatMap(([section, files]) =>
    files.map((f) => [f, section as Section] as const),
  ),
);

export const sectionOf = (file: string): Section | undefined => BY_FILE.get(file);

/** `<!-- routes:master-data-and-capacity:start -->` and its end marker. */
export function markers(section: Section) {
  const slug = section
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return { start: `<!-- routes:${slug}:start -->`, end: `<!-- routes:${slug}:end -->` };
}
