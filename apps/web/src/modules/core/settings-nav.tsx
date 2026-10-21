import type { SettingsView } from '@rampflow/shared/modules/core/api.settings';
import { LabelPart, type SettingsTopic } from '@rampflow/shared/values';
import { Link, useNavigate } from '@tanstack/react-router';
import { SearchIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { searchable } from '@/lib/search';
import { cn } from '@/lib/utils';
import { type SettingsLevel, topicLink } from './settings-levels';
import { availableTopics, sectionsOf } from './settings-placement';
import { settingLabelKey } from './settings-topic-form';

// The topic navigation and the settings search of one level (ADR-0020, design decisions 3, 8).

const verticalClass =
  'flex h-9 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground';
const horizontalClass =
  'inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground aria-[current=page]:bg-background aria-[current=page]:text-foreground aria-[current=page]:shadow-sm';

/** The level's topics as real links; the current one carries `aria-current="page"`. */
export function SettingsTopicNav({
  level,
  view,
  tabs = false,
  className,
}: {
  level: SettingsLevel;
  view: SettingsView;
  /** A tab row in the site view; otherwise a column beside the form on platform and tenant. */
  tabs?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const vertical = !tabs;
  return (
    <nav
      aria-label={t(($) => $['settings-ui'].topics_label)}
      className={cn(
        vertical ? 'flex flex-col gap-0.5' : 'flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1',
        className,
      )}
    >
      {availableTopics(view.items).map((topic) => (
        <Link
          key={topic}
          {...topicLink(level, topic)}
          className={vertical ? verticalClass : horizontalClass}
        >
          {t(($) => $['settings-ui'].topics[topic])}
        </Link>
      ))}
    </nav>
  );
}

interface SearchEntry {
  key: SettingsView['items'][number]['key'];
  topic: SettingsTopic;
  label: string;
  description: string;
  where: string;
}

/**
 * "Search settings": a dialog over every setting available on the level, matched on label,
 * description and key without case or accents. Choosing one opens its deep link.
 */
export function SettingsSearch({ level, view }: { level: SettingsLevel; view: SettingsView }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const entries = useMemo(
    () =>
      availableTopics(view.items).flatMap((topic) =>
        sectionsOf(topic, view.items).flatMap(({ section, items }) =>
          items.map(
            (item): SearchEntry => ({
              key: item.key,
              topic,
              label: t(settingLabelKey(item.key, LabelPart.label) as never) as string,
              description: t(settingLabelKey(item.key, LabelPart.description) as never) as string,
              where: `${t(($) => $['settings-ui'].topics[topic])} › ${t(($) => $['settings-ui'].sections[section])}`,
            }),
          ),
        ),
      ),
    [view.items, t],
  );
  const title = t(($) => $['settings-ui'].search.button);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <SearchIcon />
        {title}
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={t(($) => $['settings-ui'].search.placeholder)}
      >
        <Command
          filter={(value, search, keywords) =>
            searchable([value, ...(keywords ?? [])].join(' ')).includes(searchable(search.trim()))
              ? 1
              : 0
          }
        >
          <CommandInput placeholder={t(($) => $['settings-ui'].search.placeholder)} />
          <CommandList>
            <CommandEmpty>{t(($) => $['settings-ui'].search.empty)}</CommandEmpty>
            {entries.map((entry) => (
              <CommandItem
                key={entry.key}
                value={entry.key}
                keywords={[entry.label, entry.description]}
                onSelect={() => {
                  setOpen(false);
                  void navigate(topicLink(level, entry.topic, entry.key));
                }}
              >
                <div className="flex min-w-0 flex-col">
                  <span>{entry.label}</span>
                  <span className="text-xs text-muted-foreground">{entry.where}</span>
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
