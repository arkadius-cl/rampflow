import type { VisibleNavItem } from '@rampflow/shared';
import type { MeResponse } from '@rampflow/shared/modules/core/api.auth';
import { useRouterState } from '@tanstack/react-router';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { useTranslation } from 'react-i18next';
import type { Membership, NavGroup } from '@/components/shells/office-shell';
import { type AreaAccess, navHref, navOf } from '@/lib/access';

// Navigation of the area shells, rendered from `navFor` (module contract, "Web gating").

/** Daily work comes first in the tenant sidebar; everything else is administration. */
const OPERATIONS: ReadonlySet<string> = new Set([
  'booking.plan',
  'yard.gate',
  'yard.docks',
  'report.reports',
]);

export function NavIcon({ name, className }: { name: string; className?: string }) {
  return <DynamicIcon name={name as IconName} className={className} fallback={() => null} />;
}

type IconComponent = (props: { className?: string }) => React.ReactNode;
const icons = new Map<string, IconComponent>();

/** One stable component per icon name, so re-renders do not remount the lazily loaded icon. */
export function iconOf(name: string): IconComponent {
  let icon = icons.get(name);
  if (!icon) {
    icon = ({ className }) => <NavIcon name={name} className={className} />;
    icons.set(name, icon);
  }
  return icon;
}

export interface ShellNav {
  groups: NavGroup[];
  items: (VisibleNavItem & { href: string; label: string })[];
  /** The item whose path the current location is in, if any. */
  current: (VisibleNavItem & { href: string; label: string }) | undefined;
}

/** The sidebar of the area, with labels from `<module>:nav.<id>` and the active item marked. */
export function useShellNav(access: AreaAccess): ShellNav {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = navOf(access).map((item) => ({
    ...item,
    href: navHref(item, access.orgId),
    label: t(`${item.module}:nav.${item.id}` as never) as string,
  }));
  const current = items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const entry = (i: (typeof items)[number]) => ({
    label: i.label,
    href: i.href,
    icon: iconOf(i.icon),
    active: i === current,
  });
  if (access.area !== 'tenant') return { groups: [{ items: items.map(entry) }], items, current };
  const key = (i: VisibleNavItem) => `${i.module}.${i.id}`;
  const operations = items.filter((i) => OPERATIONS.has(key(i)));
  const administration = items.filter((i) => !OPERATIONS.has(key(i)));
  const groups: NavGroup[] = [
    { label: t(($) => $.shell.nav_group.operations), items: operations.map(entry) },
    { label: t(($) => $.shell.nav_group.administration), items: administration.map(entry) },
  ].filter((g) => g.items.length > 0);
  return { groups, items: [...operations, ...administration], current };
}

/** Where the org picker and the org switcher go for a membership. */
export function homeOf(m: MeResponse['memberships'][number]): string {
  switch (m.orgKind) {
    case 'tenant':
      return `/t/${m.orgId}`;
    case 'carrier':
      return `/c/${m.orgId}`;
    case 'platform':
      return '/platform';
  }
}

/** The memberships of /api/me in the shape of the org switcher. */
export function useMemberships(me: MeResponse): Membership[] {
  const { t } = useTranslation();
  return me.memberships.map((m) => ({
    id: m.orgKind === 'platform' ? 'platform' : m.orgId,
    name: m.orgName,
    kind: m.orgKind,
    role: t(($) => $.shell.roles[m.role]),
    href: homeOf(m),
  }));
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
