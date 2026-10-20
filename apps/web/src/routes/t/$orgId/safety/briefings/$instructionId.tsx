import {
  SafetyLocale,
  type VersionDetail,
  type VersionSummary,
} from '@rampflow/shared/modules/safety/api.authoring';
import { VersionStatus } from '@rampflow/shared/modules/safety/values';
import { Feature, Permission } from '@rampflow/shared/values';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeftIcon, FilePlusIcon, LockIcon, SendIcon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';
import { RouteNotFound } from '@/components/app-shell/route-states';
import { PageHeader } from '@/components/shells/office-shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { guard, tenantContextQuery, useAccess } from '@/lib/access';
import { api, call } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { ContentForm } from '@/modules/safety/content-form';
import {
  TranslationBadge,
  useDate,
  useLanguageName,
  VersionStatusBadge,
} from '@/modules/safety/display';
import { PublishDialog } from '@/modules/safety/publish-dialog';
import {
  instructionsQuery,
  safetyKey,
  versionQuery,
  versionsQuery,
} from '@/modules/safety/queries';

// SF-01, SF-02: one briefing. The left column picks a version and a language; the main column
// edits that language of a draft, or shows a published or retired version read-only.

const EditorSearch = z.object({
  version: z.uuid().optional().catch(undefined),
  locale: SafetyLocale.optional().catch(undefined),
});

export const Route = createFileRoute('/t/$orgId/safety/briefings/$instructionId')({
  validateSearch: EditorSearch,
  beforeLoad: guard({ permission: Permission.safety.manage_briefings }),
  component: EditorPage,
});

/** The draft if there is one, else the published version, else the newest. */
const defaultVersion = (versions: readonly VersionSummary[]) =>
  versions.find((v) => v.status === VersionStatus.draft) ??
  versions.find((v) => v.status === VersionStatus.published) ??
  versions[0];

function EditorPage() {
  const { t } = useTranslation('safety');
  const { orgId, instructionId } = Route.useParams();
  const search = Route.useSearch();
  const instructions = useQuery(instructionsQuery(orgId));
  const versions = useQuery(versionsQuery(orgId, instructionId));
  const sites = useQuery(tenantContextQuery(orgId)).data?.sites ?? [];
  const instruction = instructions.data?.find((i) => i.id === instructionId);
  const selected =
    versions.data?.find((v) => v.id === search.version) ??
    (versions.data ? defaultVersion(versions.data) : undefined);
  const version = useQuery({
    ...versionQuery(orgId, selected?.id ?? ''),
    enabled: selected !== undefined,
  });

  if (instructions.isSuccess && !instruction) return <RouteNotFound />;
  if (!instruction || !versions.data || !selected) return <Skeleton className="h-96 w-full" />;

  const siteNames = new Map(sites.map((s) => [s.id, s.name]));
  const appliesTo = instruction.allSites
    ? t(($) => $.briefings.all_sites)
    : instruction.siteIds
        .map((id) => siteNames.get(id) ?? '')
        .filter(Boolean)
        .join(', ');

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/t/$orgId/safety/briefings"
        params={{ orgId }}
        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'w-fit')}
      >
        <ArrowLeftIcon /> {t(($) => $.editor.back)}
      </Link>
      <PageHeader
        title={instruction.name}
        description={appliesTo}
        actions={
          version.data ? (
            <VersionActions orgId={orgId} instructionId={instructionId} version={version.data} />
          ) : null
        }
      />
      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <VersionNav
            orgId={orgId}
            instructionId={instructionId}
            versions={versions.data}
            selectedId={selected.id}
            locale={search.locale}
          />
          {version.data ? (
            <LanguageNav
              orgId={orgId}
              instructionId={instructionId}
              version={version.data}
              locale={search.locale}
            />
          ) : null}
        </div>
        {version.data ? (
          <VersionContent orgId={orgId} version={version.data} locale={search.locale} />
        ) : (
          <Skeleton className="h-96 w-full" />
        )}
      </div>
    </div>
  );
}

function VersionActions({
  orgId,
  instructionId,
  version,
}: {
  orgId: string;
  instructionId: string;
  version: VersionDetail;
}) {
  const { t } = useTranslation('safety');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [publishing, setPublishing] = useState(false);
  const openDraft = useMutation({
    mutationFn: () =>
      call<VersionDetail>(
        api.t[':orgId'].safety.instructions[':instructionId'].versions.$post({
          param: { orgId, instructionId },
        }),
      ),
    onSuccess: async (draft) => {
      await queryClient.invalidateQueries({ queryKey: safetyKey(orgId) });
      await navigate({
        to: '/t/$orgId/safety/briefings/$instructionId',
        params: { orgId, instructionId },
        search: (s) => ({ ...s, version: draft.id }),
      });
    },
  });
  if (version.status === VersionStatus.draft) {
    return (
      <>
        <Button size="sm" onClick={() => setPublishing(true)}>
          <SendIcon /> {t(($) => $.editor.publish.action)}
        </Button>
        {publishing ? (
          <PublishDialog orgId={orgId} version={version} open onOpenChange={setPublishing} />
        ) : null}
      </>
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={openDraft.isPending}
      onClick={() => openDraft.mutate()}
    >
      <FilePlusIcon /> {t(($) => $.editor.new_version)}
    </Button>
  );
}

function VersionNav({
  orgId,
  instructionId,
  versions,
  selectedId,
  locale,
}: {
  orgId: string;
  instructionId: string;
  versions: readonly VersionSummary[];
  selectedId: string;
  locale: SafetyLocale | undefined;
}) {
  const { t } = useTranslation('safety');
  const date = useDate();
  return (
    <nav aria-label={t(($) => $.editor.versions)} className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">{t(($) => $.editor.versions)}</h2>
      {versions.map((v) => (
        <Link
          key={v.id}
          to="/t/$orgId/safety/briefings/$instructionId"
          params={{ orgId, instructionId }}
          search={{ version: v.id, locale }}
          aria-current={v.id === selectedId ? 'page' : undefined}
          className={cn(
            'flex flex-col gap-1 rounded-lg border bg-background px-3 py-2 text-sm hover:bg-muted',
            v.id === selectedId && 'border-primary ring-1 ring-primary',
          )}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="font-medium">
              {t(($) => $.editor.version, { version: v.version })}
            </span>
            <VersionStatusBadge status={v.status} size="sm" />
          </span>
          {v.publishedAt ? (
            <span className="text-xs text-muted-foreground">
              {t(($) => $.editor.published_on, { date: date(v.publishedAt) })}
              {v.materialChange ? (
                <span className="ml-1 inline-flex items-center gap-0.5 font-medium text-tone-onsite">
                  <TriangleAlertIcon className="size-3" aria-hidden />
                  {t(($) => $.editor.material)}
                </span>
              ) : null}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

/** The version's languages, the UI language first when the version has it. */
function useOrderedContent(version: VersionDetail) {
  const ui = useLocale();
  return [...version.content].sort((a, b) => Number(b.locale === ui) - Number(a.locale === ui));
}

function LanguageNav({
  orgId,
  instructionId,
  version,
  locale,
}: {
  orgId: string;
  instructionId: string;
  version: VersionDetail;
  locale: SafetyLocale | undefined;
}) {
  const { t } = useTranslation('safety');
  const { has } = useAccess();
  const languageName = useLanguageName();
  const content = useOrderedContent(version);
  const current = locale ?? content[0]?.locale;
  return (
    <nav aria-label={t(($) => $.editor.languages)} className="flex flex-col gap-1">
      <h2 className="text-sm font-medium">{t(($) => $.editor.languages)}</h2>
      {content.map((c) => (
        <Link
          key={c.locale}
          to="/t/$orgId/safety/briefings/$instructionId"
          params={{ orgId, instructionId }}
          search={{ version: version.id, locale: c.locale }}
          aria-current={c.locale === current ? 'page' : undefined}
          className={cn(
            'flex flex-col gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-muted',
            c.locale === current && 'bg-muted font-medium',
          )}
        >
          <span lang={c.locale}>{languageName(c.locale)}</span>
          <span className="flex items-center gap-2">
            <TranslationBadge state={c.translation} size="sm" />
            {has(Feature.safety.quiz) ? (
              <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                {t(($) => $.editor.questions_count, { n: c.questions.length })}
              </span>
            ) : null}
          </span>
        </Link>
      ))}
    </nav>
  );
}

function VersionContent({
  orgId,
  version,
  locale,
}: {
  orgId: string;
  version: VersionDetail;
  locale: SafetyLocale | undefined;
}) {
  const { t } = useTranslation('safety');
  const { has } = useAccess();
  const languageName = useLanguageName();
  const ordered = useOrderedContent(version);
  const content = ordered.find((c) => c.locale === locale) ?? ordered[0];
  const readOnly = version.status !== VersionStatus.draft;
  if (!content) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span lang={content.locale}>{languageName(content.locale)}</span>
          <span className="text-muted-foreground">
            {t(($) => $.editor.version, { version: version.version })}
          </span>
          <TranslationBadge state={content.translation} size="sm" />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {readOnly ? (
          <Alert>
            <LockIcon />
            <AlertTitle>{t(($) => $.editor.read_only.title)}</AlertTitle>
            <AlertDescription>
              {version.status === VersionStatus.retired
                ? t(($) => $.editor.retired_note)
                : t(($) => $.editor.read_only.description)}
            </AlertDescription>
          </Alert>
        ) : null}
        <ContentForm
          key={`${version.id}-${content.locale}-${content.contentHash}-${content.translation}`}
          orgId={orgId}
          versionId={version.id}
          content={content}
          readOnly={readOnly}
          quiz={has(Feature.safety.quiz)}
        />
      </CardContent>
    </Card>
  );
}
