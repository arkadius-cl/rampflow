import { PageWidth } from '@rampflow/shared/values';
import { useNavigate, useRouteContext, useRouter } from '@tanstack/react-router';
import { ChevronRightIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from '@/components/shells/office-shell';
import { Page } from '@/components/shells/page';
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item';
import type { AreaRouteContext } from '@/lib/access';
import { NavIcon, useShellNav } from './nav';

/**
 * `/t/$orgId`, `/c/$orgId` and `/platform`: opens the first screen of the area's navigation.
 * While no screen of the area exists yet, it lists the navigation instead.
 */
export function AreaHome() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigate = useNavigate();
  const { access, me } = useRouteContext({ strict: false }) as AreaRouteContext;
  const nav = useShellNav(access);
  const routes = router.routesByPath as unknown as Readonly<Record<string, unknown>>;
  const first = nav.items.find((item) => routes[item.to] ?? routes[`${item.to}/`]);
  useEffect(() => {
    if (first) void navigate({ href: first.href, replace: true });
  }, [first, navigate]);
  if (first) return null;
  return (
    <Page
      width={PageWidth.wide}
      title={t(($) => $.shell.home.title, { name: me.user.name })}
      description={t(($) => $.shell.home.description)}
    >
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {nav.items.map((item) => (
          <Item key={item.href} variant="outline" render={<NavLink href={item.href} />}>
            <ItemMedia variant="icon">
              <NavIcon name={item.icon} />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{item.label}</ItemTitle>
            </ItemContent>
            <ItemActions>
              <ChevronRightIcon className="size-4" />
            </ItemActions>
          </Item>
        ))}
      </div>
    </Page>
  );
}
