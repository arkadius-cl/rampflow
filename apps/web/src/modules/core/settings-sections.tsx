import type { SettingsView } from '@rampflow/shared/modules/core/api.settings';
import { useTranslation } from 'react-i18next';
import { availableTopics } from './settings-placement';
import { type SettingChanges, SettingsTopicForm } from './settings-topic-form';

// Every topic of one level on one page, until the topic routes replace these pages (change 06).

export function SettingsSections({
  view,
  save,
}: {
  view: SettingsView;
  save: (changes: SettingChanges) => Promise<SettingsView>;
}) {
  const { t } = useTranslation();
  const topics = availableTopics(view.items);
  if (topics.length === 0) {
    return <p className="text-sm text-muted-foreground">{t(($) => $['settings-ui'].empty)}</p>;
  }
  return (
    <div className="flex max-w-5xl flex-col gap-10">
      {topics.map((topic) => (
        <section key={topic} aria-labelledby={`topic-${topic}`} className="flex flex-col gap-4">
          <h2 id={`topic-${topic}`} className="text-lg font-semibold">
            {t(($) => $['settings-ui'].topics[topic])}
          </h2>
          <SettingsTopicForm view={view} topic={topic} save={save} />
        </section>
      ))}
    </div>
  );
}
