/**
 * The sections of docs/reference/api-routes.md and their router files, relative to apps/api/src.
 * Sections do not follow modules (`core/sites` is master data), so the map is written by hand.
 */
export const SECTIONS = {
  'Auth, me and invitations': [
    'app.ts',
    'modules/core/auth/routes.anonymous.ts',
    'modules/core/me/routes.user.ts',
    'modules/core/invitations/routes.public.ts',
    'modules/core/context/routes.tenant.ts',
    'modules/core/context/routes.carrier.ts',
    'modules/core/context/routes.platform.ts',
  ],
  'Platform administration': ['modules/core/platform/routes.platform.ts'],
  'Tenant administration': [
    'modules/core/staff/routes.tenant.ts',
    'modules/core/settings/routes.tenant.ts',
    'modules/core/carrier-users/routes.carrier.ts',
    'modules/brand/logo/routes.tenant.ts',
    'modules/brand/logo/routes.public.ts',
  ],
  'Master data and capacity': [
    'modules/core/sites/routes.tenant.ts',
    'modules/booking/capacity/routes.tenant.ts',
  ],
  'Safety authoring and register': [
    'modules/safety/authoring/routes.tenant.ts',
    'modules/safety/register/routes.tenant.ts',
  ],
  'Bookings (staff)': ['modules/booking/staff/routes.tenant.ts'],
  'Carrier network': [
    'modules/booking/carriers/routes.tenant.ts',
    'modules/booking/carriers/routes.carrier.ts',
    'modules/booking/carriers/routes.public.ts',
    'modules/booking/registration/routes.public.ts',
  ],
  'Carrier booking portal': [
    'modules/booking/portal/routes.carrier.ts',
    'modules/booking/portal/routes.carrier-at-tenant.ts',
  ],
  Yard: ['modules/yard/routes.tenant.ts'],
  Driver: [
    'modules/driver/session/routes.driver.ts',
    'modules/driver/session/routes.public.ts',
    'modules/driver/view/routes.driver.ts',
    'modules/safety/driver/routes.driver.ts',
  ],
  Reports: ['modules/report/kpi/routes.tenant.ts'],
  Privacy: ['modules/privacy/requests/routes.tenant.ts'],
} as const satisfies Record<string, readonly string[]>;

export type Section = keyof typeof SECTIONS;

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
