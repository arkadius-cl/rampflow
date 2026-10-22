import type { MeResponse } from '@rampflow/shared/modules/core/api.auth';
import { OrgKind } from '@rampflow/shared/values';
import { useMatches } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { OfficeShell } from '@/components/shells/office-shell';
import { useAccountTheme } from '@/hooks/use-theme';
import type { AreaAccess } from '@/lib/access';
import { initialsOf, useMemberships, useShellNav } from './nav';
import { UserMenuItems } from './user-menu';

/**
 * The office shell of every area (ADR-0011): sidebar from `navFor`, the org switcher with every
 * membership, and the user menu with language, appearance and sign-out. The account's theme
 * (`app.theme`, ADR-0014) applies here.
 */
export function AppShell({
  access,
  me,
  children,
}: {
  access: AreaAccess;
  me: MeResponse;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const nav = useShellNav(access);
  const memberships = useMemberships(me);
  const theme = useAccountTheme();
  // Every match with a crumb links to its own path, so the bar carries the way back (ADR-0022).
  const crumbs = useMatches({
    select: (ms) =>
      ms.flatMap((m) => {
        const label = m.staticData.crumb?.(m, t);
        return label ? [{ label, href: m.pathname }] : [];
      }),
  });
  const orgId = access.area === OrgKind.platform ? 'platform' : access.orgId;
  const org = memberships.find((m) => m.id === orgId) ?? {
    id: orgId,
    name: access.area === OrgKind.platform ? 'rampflow' : access.context.org.name,
    kind: access.area,
    role: t(($) => $.shell.roles[access.context.role]),
  };
  return (
    <OfficeShell
      org={org}
      memberships={memberships}
      nav={nav.groups}
      breadcrumbs={[
        { label: org.name },
        ...(nav.current ? [{ label: nav.current.label, href: nav.current.href }] : []),
        ...crumbs,
      ]}
      user={{ name: me.user.name, initials: initialsOf(me.user.name) }}
      userMenu={<UserMenuItems me={me} theme={theme} />}
      search={false}
    >
      {children}
    </OfficeShell>
  );
}
