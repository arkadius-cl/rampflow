import type { MeResponse } from '@rampflow/shared/modules/core/api.auth';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { BuildingIcon, ChevronRightIcon, TruckIcon, WrenchIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/components/app-shell/auth-layout';
import { homeOf } from '@/components/app-shell/nav';
import { useSignOut, useSyncLocale } from '@/components/app-shell/user-menu';
import { NavLink } from '@/components/shells/office-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { meQuery, requireMe } from '@/lib/access';

// The org picker (ADR-0011): every membership of the signed-in user. With exactly one it goes
// straight there. The org last opened on this device comes first.

const LAST_ORG_KEY = 'rf_last_org';

export const rememberOrg = (orgId: string) => localStorage.setItem(LAST_ORG_KEY, orgId);

const KIND_ICON = { tenant: BuildingIcon, carrier: TruckIcon, platform: WrenchIcon } as const;

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context, location }) => {
    const me = await requireMe(context.queryClient, location.href);
    const [only, ...more] = me.memberships;
    if (only && more.length === 0) throw redirect({ href: homeOf(only), replace: true });
  },
  component: OrgPicker,
});

function ordered(memberships: MeResponse['memberships']) {
  const last = localStorage.getItem(LAST_ORG_KEY);
  return [...memberships].sort((a, b) => Number(b.orgId === last) - Number(a.orgId === last));
}

function OrgPicker() {
  const { t } = useTranslation();
  const { data: me } = useSuspenseQuery(meQuery);
  const signOut = useSignOut();
  useSyncLocale(me);
  const last = localStorage.getItem(LAST_ORG_KEY);
  return (
    <AuthLayout
      signedIn
      title={t(($) => $.shell.picker.title)}
      description={t(($) => $.shell.picker.signed_in_as, { name: me.user.name })}
    >
      {me.memberships.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{t(($) => $.shell.picker.none_title)}</EmptyTitle>
            <EmptyDescription>{t(($) => $.shell.picker.none_description)}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {ordered(me.memberships).map((m) => {
            const Icon = KIND_ICON[m.orgKind];
            return (
              <Item
                key={m.orgId}
                variant="outline"
                render={<NavLink href={homeOf(m)} onClick={() => rememberOrg(m.orgId)} />}
              >
                <ItemMedia variant="icon">
                  <Icon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{m.orgName}</ItemTitle>
                  <ItemDescription>
                    {t(($) => $.shell.org_kind[m.orgKind])} · {t(($) => $.shell.roles[m.role])}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  {m.orgId === last ? (
                    <Badge variant="secondary">{t(($) => $.shell.picker.last_used)}</Badge>
                  ) : null}
                  <ChevronRightIcon className="size-4" />
                </ItemActions>
              </Item>
            );
          })}
        </div>
      )}
      <div className="mt-6 flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => signOut.mutate()}>
          {t(($) => $.shell.sign_out)}
        </Button>
      </div>
    </AuthLayout>
  );
}
