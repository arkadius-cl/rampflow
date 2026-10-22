import { PageWidth, SettingScope, type SettingsTopic } from '@rampflow/shared/values';
import { useSuspenseQuery } from '@tanstack/react-query';
import { type AnyRouteMatch, Link, Outlet, useParams } from '@tanstack/react-router';
import type { TFunction } from 'i18next';
import { MapPinIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Page } from '@/components/shells/page';
import { buttonVariants } from '@/components/ui/button';
import { useAccess } from '@/lib/access';
import {
  originLinkFor,
  type SettingsLevel,
  settingsQuery,
  useSaveSettings,
} from './settings-levels';
import { SettingsSearch, SettingsTopicNav } from './settings-nav';
import { SettingsTopicForm } from './settings-topic-form';

// The settings pages of the three levels (PL-03, TN-02, MD-01; ADR-0020, ADR-0022). On every
// level the topics are a vertical list in a 14rem column left of the form. `data-settings-page`
// gives the document the scroll padding of the sticky save bar (index.css, WCAG 2.4.11).

/** Platform and tenant: an Einstellungsseite with the topic as title and the search as action. */
export function SettingsLayout({
  level,
}: {
  level: Exclude<SettingsLevel, { scope: typeof SettingScope.site }>;
}) {
  const { t } = useTranslation();
  const view = useSuspenseQuery(settingsQuery(level)).data;
  const topic = useParams({ strict: false, select: (p) => p.topic }) as SettingsTopic | undefined;
  const tenant = level.scope === SettingScope.tenant;
  return (
    <Page
      width={PageWidth.narrow}
      title={topic ? t(($) => $['settings-ui'].topics[topic]) : t(($) => $['settings-ui'].title)}
      description={
        tenant
          ? t(($) => $['settings-ui'].description)
          : t(($) => $['settings-ui'].platform_description)
      }
      actions={
        <>
          {tenant ? (
            <Link
              to="/t/$orgId/sites"
              params={{ orgId: level.orgId }}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <MapPinIcon />
              {t(($) => $['settings-ui'].site_settings)}
            </Link>
          ) : null}
          <SettingsSearch level={level} view={view} />
        </>
      }
    >
      <div
        data-settings-page
        className="grid items-start gap-6 lg:grid-cols-[14rem_minmax(0,64rem)]"
      >
        <SettingsTopicNav level={level} view={view} className="lg:sticky lg:top-4" />
        <Outlet />
      </div>
    </Page>
  );
}

/** The site's Settings tab: the same topic list beside the form; the site page owns the h1. */
export function SiteSettingsLayout({
  level,
}: {
  level: Extract<SettingsLevel, { scope: typeof SettingScope.site }>;
}) {
  const { t } = useTranslation();
  const view = useSuspenseQuery(settingsQuery(level)).data;
  const topic = useParams({ strict: false, select: (p) => p.topic }) as SettingsTopic | undefined;
  return (
    <div data-settings-page className="grid items-start gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <SettingsTopicNav level={level} view={view} className="lg:sticky lg:top-4" />
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {topic ? (
            <h2 className="text-lg font-semibold">{t(($) => $['settings-ui'].topics[topic])}</h2>
          ) : null}
          <SettingsSearch level={level} view={view} />
        </div>
        <Outlet />
      </div>
    </div>
  );
}

/** One topic of a level: its form, saved in one PATCH, with links to the levels above. */
export function SettingsTopicPage({
  level,
  topic,
}: {
  level: SettingsLevel;
  topic: SettingsTopic;
}) {
  const view = useSuspenseQuery(settingsQuery(level)).data;
  const save = useSaveSettings(level);
  const { can } = useAccess();
  return (
    <SettingsTopicForm
      // A new topic is a new form: its drafts and dirty state start over.
      key={topic}
      view={view}
      topic={topic}
      save={save}
      originLink={originLinkFor(level, topic, can)}
    />
  );
}

/** The breadcrumb of a `$topic` route: the topic's name. */
export const topicCrumb = (match: AnyRouteMatch, t: TFunction) =>
  t(($) => $['settings-ui'].topics[(match.params as { topic: SettingsTopic }).topic]);
