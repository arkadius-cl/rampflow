import { SettingScope, type SettingsTopic } from '@rampflow/shared/values';
import { useSuspenseQuery } from '@tanstack/react-query';
import { type AnyRouteMatch, Link, Outlet, useParams } from '@tanstack/react-router';
import type { TFunction } from 'i18next';
import { MapPinIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shells/page';
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

// The settings pages of the three levels (PL-03, TN-02, MD-01; ADR-0020). `data-settings-page`
// gives the document the scroll padding of the sticky save bar (index.css, WCAG 2.4.11).

/** Platform and tenant: the topic as title, search, and the topics in a column left of the form. */
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
    <div data-settings-page className="flex flex-col gap-4">
      <PageHeader
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
      />
      <div className="grid items-start gap-6 lg:grid-cols-[12rem_minmax(0,48rem)]">
        <SettingsTopicNav level={level} view={view} className="lg:sticky lg:top-4" />
        <Outlet />
      </div>
    </div>
  );
}

/** The site's Settings tab: the topics as a second tab row, so the form keeps its width. */
export function SiteSettingsLayout({
  level,
}: {
  level: Extract<SettingsLevel, { scope: typeof SettingScope.site }>;
}) {
  const { t } = useTranslation();
  const view = useSuspenseQuery(settingsQuery(level)).data;
  const topic = useParams({ strict: false, select: (p) => p.topic }) as SettingsTopic | undefined;
  return (
    <div data-settings-page className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SettingsTopicNav level={level} view={view} tabs />
        <SettingsSearch level={level} view={view} />
      </div>
      <div className="flex max-w-3xl flex-col gap-4">
        {/* The site's name is the page's h1; the topic names this tab's content. */}
        {topic ? (
          <h2 className="text-lg font-semibold">{t(($) => $['settings-ui'].topics[topic])}</h2>
        ) : null}
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
