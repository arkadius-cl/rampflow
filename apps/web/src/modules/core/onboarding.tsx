import { CarriersTab } from '@rampflow/shared/modules/booking/values';
import type { OnboardingStepState } from '@rampflow/shared/modules/core/api.onboarding';
import { OnboardingStep, TenantStatus } from '@rampflow/shared/modules/core/values';
import { PageWidth, Permission } from '@rampflow/shared/values';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  ChevronRightIcon,
  CircleCheckIcon,
  CircleIcon,
  InfoIcon,
  LockIcon,
  PartyPopperIcon,
} from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Page } from '@/components/shells/page';
import { SiteTime } from '@/components/site-time';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { tenantContextQuery, useAccess, useTenantStatus } from '@/lib/access';
import { useLocale } from '@/lib/i18n';
import { siteTime, viewerTimeZone } from '@/lib/time';
import { cn } from '@/lib/utils';
import { capacityQueries } from '@/modules/capacity/queries';
import { zoneNames } from '@/modules/capacity/time';
import { WeekHoursList } from '@/modules/capacity/week-windows';
import { onboardingQuery } from './queries';

// ON-01 to ON-03: the checklist from an empty company to its first dock, the notice on every
// tenant screen while it is missing, and the gate around actions that need a working dock. The
// checklist links to the master data screens and holds no forms of its own.

/** `/t/$orgId/onboarding`: the three steps, or the active state with the next steps. */
export function OnboardingChecklist({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const view = useSuspenseQuery(onboardingQuery(orgId)).data;
  const active = view.status === TenantStatus.active;
  const done = view.steps.filter((s) => s.done).length;
  return (
    <Page
      width={PageWidth.narrow}
      title={active ? t(($) => $.onboarding.active.title) : t(($) => $.onboarding.title)}
      description={
        active ? undefined : t(($) => $.onboarding.progress, { done, total: view.steps.length })
      }
    >
      {active && view.activatedAt ? (
        <ActiveSince orgId={orgId} at={view.activatedAt} siteId={view.steps[0]?.siteId ?? null} />
      ) : (
        <p className="text-sm text-muted-foreground">{t(($) => $.onboarding.description)}</p>
      )}
      <ol className="flex flex-col gap-4">
        {view.steps.map((step) => (
          <li key={step.id}>
            <StepItem orgId={orgId} step={step} />
          </li>
        ))}
      </ol>
    </Page>
  );
}

function StepItem({ orgId, step }: { orgId: string; step: OnboardingStepState }) {
  const { t } = useTranslation();
  const Icon = step.done ? CircleCheckIcon : CircleIcon;
  const body = (
    <>
      <ItemMedia variant="icon" className={cn(step.done && 'text-tone-success')}>
        <Icon aria-hidden />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{t(($) => $.onboarding.steps[step.id].title)}</ItemTitle>
        <ItemDescription>
          {!step.done && step.siteId === null && step.id !== OnboardingStep.site
            ? t(($) => $.onboarding.needs_site)
            : t(($) => $.onboarding.steps[step.id].description)}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <span
          className={cn(
            'text-sm font-medium',
            step.done ? 'text-tone-success' : 'text-muted-foreground',
          )}
        >
          {step.done ? t(($) => $.onboarding.state.done) : t(($) => $.onboarding.state.open)}
        </span>
        {step.done ? null : <ChevronRightIcon className="size-4" aria-hidden />}
      </ItemActions>
    </>
  );
  if (!step.done && step.id === OnboardingStep.site) {
    return (
      <Item
        variant="outline"
        render={<Link to="/t/$orgId/sites" params={{ orgId }} search={{ new: 1 }} />}
      >
        {body}
      </Item>
    );
  }
  if (!step.done && step.siteId) {
    return (
      <Item
        variant="outline"
        render={<Link to="/t/$orgId/sites/$siteId" params={{ orgId, siteId: step.siteId }} />}
      >
        {body}
      </Item>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Item variant="outline">{body}</Item>
      {step.done && step.id === OnboardingStep.site && step.siteId ? (
        <SiteHours orgId={orgId} siteId={step.siteId} />
      ) : null}
    </div>
  );
}

/** The weekly hours of the site the site step found, with a link to its hours tab. */
function SiteHours({ orgId, siteId }: { orgId: string; siteId: string }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { can } = useAccess();
  const site = useQuery(tenantContextQuery(orgId)).data?.sites.find((s) => s.id === siteId);
  const hours = useQuery({
    ...capacityQueries.hours(orgId, siteId),
    enabled: can(Permission.booking.view),
  }).data;
  if (!hours || !site) return null;
  return (
    <div className="ml-14 flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        {t(($) => $.onboarding.hours_of, {
          site: site.name,
          zone: `${site.timeZone} (${zoneNames(site.timeZone, locale)})`,
        })}
      </p>
      <WeekHoursList
        rows={hours.items.filter((r) => r.resourceId === null)}
        label={t(($) => $.onboarding.hours)}
      />
      <Link
        to="/t/$orgId/sites/$siteId/hours"
        params={{ orgId, siteId }}
        className="w-fit text-sm underline underline-offset-4"
      >
        {t(($) => $.onboarding.edit_hours)}
      </Link>
    </div>
  );
}

function ActiveSince({ orgId, at, siteId }: { orgId: string; at: string; siteId: string | null }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { can } = useAccess();
  const sites = useQuery(tenantContextQuery(orgId)).data?.sites ?? [];
  const timeZone = sites.find((s) => s.id === siteId)?.timeZone ?? viewerTimeZone();
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone }).format(
    new Date(at),
  );
  const next: { key: string; label: string; link: ReactElement }[] = [];
  if (can(Permission.booking.manage_carriers)) {
    next.push(
      {
        key: 'carriers',
        label: t(($) => $.onboarding.active.invite_carriers),
        link: <Link to="/t/$orgId/carriers" params={{ orgId }} />,
      },
      {
        key: 'links',
        label: t(($) => $.onboarding.active.public_link),
        link: (
          <Link to="/t/$orgId/carriers" params={{ orgId }} search={{ tab: CarriersTab.links }} />
        ),
      },
    );
  }
  if (can(Permission.core.manage_staff)) {
    next.push({
      key: 'staff',
      label: t(($) => $.onboarding.active.staff),
      link: <Link to="/t/$orgId/staff" params={{ orgId }} />,
    });
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-1.5 text-sm">
        <PartyPopperIcon className="size-4 text-tone-success" aria-hidden />
        {t(($) => $.onboarding.active.since, { date })}
        <SiteTime {...siteTime(at, timeZone, locale)} />
      </p>
      {next.length > 0 ? (
        <nav aria-label={t(($) => $.onboarding.active.next)} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">{t(($) => $.onboarding.active.next)}</h2>
          {next.map((n) => (
            <Item key={n.key} variant="outline" size="sm" render={n.link}>
              <ItemContent>
                <ItemTitle>{n.label}</ItemTitle>
              </ItemContent>
              <ItemActions>
                <ChevronRightIcon className="size-4" aria-hidden />
              </ItemActions>
            </Item>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

/** The notice on every tenant screen while the first dock is missing (ON-03). */
export function OnboardingNotice({ orgId, className }: { orgId: string; className?: string }) {
  const { t } = useTranslation();
  const status = useTenantStatus();
  const { can } = useAccess();
  if (status !== TenantStatus.onboarding) return null;
  return (
    <Alert className={className}>
      <InfoIcon aria-hidden />
      <AlertDescription className="flex flex-wrap items-center gap-x-2">
        {t(($) => $.onboarding.notice.text)}
        {can(Permission.core.manage_sites) ? (
          <Link
            to="/t/$orgId/onboarding"
            params={{ orgId }}
            className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4"
          >
            {t(($) => $.onboarding.notice.link)}
          </Link>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Disables an action that needs a working dock while the tenant is in onboarding (ON-03), and
 * says why next to it: disabled buttons get no hover or focus, so the reason is never a tooltip.
 */
export function OnboardingGate({
  reason,
  touch = false,
  children,
}: {
  /** Why the action waits, for example "Carriers can be invited once the first dock exists." */
  reason: string;
  /** Station screens: the checklist link gets a 44 px target. */
  touch?: boolean;
  children: (blocked: boolean) => ReactNode;
}) {
  const { t } = useTranslation();
  const status = useTenantStatus();
  const { can, orgId } = useAccess();
  if (status !== TenantStatus.onboarding || !orgId) return children(false);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {children(true)}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LockIcon className="size-3.5 shrink-0" aria-hidden />
        {reason}
        {can(Permission.core.manage_sites) ? (
          <Link
            to="/t/$orgId/onboarding"
            params={{ orgId }}
            className={cn(
              'font-medium text-foreground underline underline-offset-4',
              touch && 'inline-flex min-h-11 items-center',
            )}
          >
            {t(($) => $.onboarding.gate.link)}
          </Link>
        ) : null}
      </p>
    </div>
  );
}
