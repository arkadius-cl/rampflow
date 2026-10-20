import type {
  PictogramId,
  TranslationState,
  VersionStatus,
} from '@rampflow/shared/modules/safety/api.authoring';
import type { AckStatus } from '@rampflow/shared/modules/safety/validity';
import { siteDay, type TimeZone } from '@rampflow/shared/time';
import { BadgeTone, DisplayNamesType } from '@rampflow/shared/values';
import {
  ArchiveIcon,
  BadgeCheckIcon,
  BotIcon,
  CircleCheckIcon,
  FilePenIcon,
  HistoryIcon,
  PenLineIcon,
  ShieldCheckIcon,
  ShieldXIcon,
  TicketCheckIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusBadge, type StatusBadgeProps, type StatusMeta } from '@/components/status-badge';
import { useLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

// Status badges, pictograms and names of the safety screens. Every status is icon plus label.

const pictogramUrls = import.meta.glob<string>(
  '../../../../../packages/shared/src/assets/pictograms/*.svg',
  { eager: true, query: '?url', import: 'default' },
);
const urlOf = (id: PictogramId) =>
  Object.entries(pictogramUrls).find(([path]) => path.endsWith(`/${id}.svg`))?.[1];

/** A bundled pictogram; `label` is its accessible name, empty when the text next to it says it. */
export function Pictogram({
  id,
  label,
  className,
}: {
  id: PictogramId;
  label: string;
  className?: string;
}) {
  return <img src={urlOf(id)} alt={label} className={cn('size-12 shrink-0', className)} />;
}

export function usePictogramName() {
  const { t } = useTranslation('safety');
  return (id: PictogramId) => t(($) => $.editor.pictogram[id]);
}

/** "Polski", "Deutsch", ...: a briefing language in the UI language, by Intl. */
export function useLanguageName() {
  const locale = useLocale();
  const names = new Intl.DisplayNames([locale], { type: DisplayNamesType.language });
  return (code: string) => {
    const name = names.of(code) ?? code;
    return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  };
}

/** A calendar date in the UI language: in the site's zone when there is one, else the viewer's. */
export function useDate() {
  const locale = useLocale();
  const format = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const utc = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
  return (instant: string, timeZone?: string) =>
    timeZone
      ? utc.format(new Date(`${siteDay(new Date(instant), timeZone as TimeZone)}T00:00:00Z`))
      : format.format(new Date(instant));
}

type BadgeProps = Omit<StatusBadgeProps, 'meta'>;

const ACK_META = {
  valid: { icon: ShieldCheckIcon, tone: BadgeTone.success },
  visit_only: { icon: TicketCheckIcon, tone: BadgeTone.planned },
  expired: { icon: ShieldXIcon, tone: BadgeTone.danger },
  outdated: { icon: HistoryIcon, tone: BadgeTone.onsite },
} as const satisfies Record<AckStatus, Omit<StatusMeta, 'label'>>;

export function AckStatusBadge({ status, ...props }: { status: AckStatus } & BadgeProps) {
  const { t } = useTranslation('safety');
  return (
    <StatusBadge
      meta={{ ...ACK_META[status], label: t(($) => $.register.status[status]) }}
      {...props}
    />
  );
}

const VERSION_META = {
  draft: { icon: FilePenIcon, tone: BadgeTone.planned },
  published: { icon: CircleCheckIcon, tone: BadgeTone.success },
  retired: { icon: ArchiveIcon, tone: BadgeTone.neutral },
} as const satisfies Record<VersionStatus, Omit<StatusMeta, 'label'>>;

export function VersionStatusBadge({ status, ...props }: { status: VersionStatus } & BadgeProps) {
  const { t } = useTranslation('safety');
  return (
    <StatusBadge
      meta={{ ...VERSION_META[status], label: t(($) => $.editor.status[status]) }}
      {...props}
    />
  );
}

const TRANSLATION_META = {
  source: { icon: PenLineIcon, tone: BadgeTone.neutral },
  machine: { icon: BotIcon, tone: BadgeTone.onsite },
  reviewed: { icon: BadgeCheckIcon, tone: BadgeTone.success },
} as const satisfies Record<TranslationState, Omit<StatusMeta, 'label'>>;

export function TranslationBadge({ state, ...props }: { state: TranslationState } & BadgeProps) {
  const { t } = useTranslation('safety');
  return (
    <StatusBadge
      meta={{ ...TRANSLATION_META[state], label: t(($) => $.editor.translation[state]) }}
      {...props}
    />
  );
}
