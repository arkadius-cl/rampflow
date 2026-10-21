import type { SettingKey } from '@rampflow/shared';
import type { SettingEntry, SettingsView } from '@rampflow/shared/modules/core/api.settings';
import { SettingControl } from '@rampflow/shared/modules/core/values';
import {
  ErrorCode,
  FieldDraftKind,
  LabelPart,
  SettingsSection,
  type SettingsTopic,
} from '@rampflow/shared/values';
import { useMutation } from '@tanstack/react-query';
import { useBlocker, useLocation, useRouter } from '@tanstack/react-router';
import { Undo2Icon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Controller, type FieldErrors, type Resolver, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { SettingField, SettingOrigin } from '@/components/settings-field';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ApiFailure } from '@/lib/api';
import { useFormat } from './format';
import { controlOf, settingDef } from './setting-control';
import { SettingInput, useSettingMessage, useValueText } from './setting-input';
import type { OriginLink } from './settings-levels';
import { PLACEMENT, type Placement, sectionsOf, unitOf } from './settings-placement';

// One topic of one settings level as one form (TN-02, PL-03; design decisions 4, 7, 9, 10).
// Each field holds a draft: a value of its own on this level, or "use the inherited value".
// Saving sends only the changed drafts in one PATCH, so a topic never ends half saved.

export type FieldDraft =
  | { kind: typeof FieldDraftKind.own; value: unknown }
  | { kind: typeof FieldDraftKind.inherit };

/** The body of the level's PATCH, without the tenant route's `siteId`. */
export interface SettingChanges {
  set: Partial<Record<SettingKey, unknown>>;
  reset: SettingKey[];
}

export interface SettingsTopicFormProps {
  /** The level's settings, as the GET or the last PATCH answered. */
  view: SettingsView;
  topic: SettingsTopic;
  /** Sends the PATCH and answers the level's new view; a 422 maps back to the fields. */
  save: (changes: SettingChanges) => Promise<SettingsView>;
  /** Links an inherited value to its source level; build it with `originLinkFor`. */
  originLink?: OriginLink;
}

/** react-hook-form reads dots in a name as nesting, so a field's name swaps them for slashes. */
const fieldName = (key: SettingKey) => key.replaceAll('.', '/');

type Drafts = Record<string, FieldDraft>;

const own = (value: unknown): FieldDraft => ({ kind: FieldDraftKind.own, value });
const INHERIT: FieldDraft = { kind: FieldDraftKind.inherit };

const draftsOf = (view: SettingsView, entries: readonly SettingEntry[]): Drafts =>
  Object.fromEntries(
    entries.map((e) => [fieldName(e.key), e.source === view.scope ? own(e.value) : INHERIT]),
  );

const sameDraft = (a: FieldDraft | undefined, b: FieldDraft | undefined) =>
  JSON.stringify(a) === JSON.stringify(b);

/** What the field shows: its own value, or what it inherits from the levels above. */
const shownValue = (entry: SettingEntry, draft: FieldDraft) =>
  draft.kind === FieldDraftKind.own ? draft.value : entry.inherited.value;

/** Discard and save reset every field; only a refetch keeps the edits (`resetOptions`). */
const EXACT = { keepDirtyValues: false };

/** The periods after which data is deleted; driver link validity sits apart and deletes nothing. */
const RETENTION_KEYS: ReadonlySet<SettingKey> = new Set(
  (Object.entries(PLACEMENT) as [SettingKey, Placement][])
    .filter(([, p]) => p.section === SettingsSection.retention)
    .map(([key]) => key),
);

interface Shortening {
  key: SettingKey;
  from: number;
  to: number;
}

/** Retention periods the save would shorten on this level, inheriting included (decision 10). */
function shortenings(entries: readonly SettingEntry[], drafts: Drafts, changed: Set<SettingKey>) {
  const found: Shortening[] = [];
  for (const entry of entries) {
    if (!RETENTION_KEYS.has(entry.key) || !changed.has(entry.key)) continue;
    const to = shownValue(entry, drafts[fieldName(entry.key)] ?? INHERIT);
    if (typeof entry.value === 'number' && typeof to === 'number' && to < entry.value) {
      found.push({ key: entry.key, from: entry.value, to });
    }
  }
  return found;
}

/** The catalog key of a setting's label or description. */
export const settingLabelKey = (key: SettingKey, part: LabelPart) => {
  const dot = key.indexOf('.');
  return `${key.slice(0, dot)}:settings.${key.slice(dot + 1)}.${part}`;
};

export function SettingsTopicForm({ view, topic, save, originLink }: SettingsTopicFormProps) {
  const { t } = useTranslation();
  const sections = useMemo(() => sectionsOf(topic, view.items), [topic, view.items]);
  const entries = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const loaded = useMemo(() => draftsOf(view, entries), [view, entries]);

  const resolver: Resolver<Drafts> = async (drafts) => {
    const errors: FieldErrors<Drafts> = {};
    for (const entry of entries) {
      const draft = drafts[fieldName(entry.key)];
      if (draft?.kind !== FieldDraftKind.own) continue;
      const parsed = settingDef(entry.key).schema.safeParse(draft.value);
      const issue = parsed.success ? undefined : parsed.error.issues[0];
      if (issue) errors[fieldName(entry.key)] = { type: issue.code, message: issue.message };
    }
    if (Object.keys(errors).length > 0) return { values: {}, errors };
    return { values: drafts, errors: {} };
  };
  const form = useForm<Drafts>({
    values: loaded,
    // A background refetch updates the untouched fields and leaves edits alone.
    resetOptions: { keepDirtyValues: true },
    resolver,
  });
  const drafts = useWatch({ control: form.control }) as Drafts;
  const baseline = form.formState.defaultValues ?? loaded;
  const changed = new Set(
    entries
      .filter((e) => !sameDraft(drafts[fieldName(e.key)], baseline[fieldName(e.key)] as FieldDraft))
      .map((e) => e.key),
  );
  const dirty = changed.size > 0;

  const mutation = useMutation({
    mutationFn: save,
    onSuccess: (next) => {
      form.reset(
        draftsOf(
          next,
          sectionsOf(topic, next.items).flatMap((s) => s.items),
        ),
        EXACT,
      );
      toast.success(t(($) => $['settings-ui'].saved));
    },
    onError: (e) => {
      if (!(e instanceof ApiFailure) || e.code !== ErrorCode.validation_failed) return;
      for (const issue of e.issues) {
        const [, key] = issue.path;
        const entry = entries.find((x) => x.key === key);
        if (entry) form.setError(fieldName(entry.key), { type: issue.code });
      }
    },
  });

  const [confirming, setConfirming] = useState<{
    changes: SettingChanges;
    shortened: Shortening[];
  } | null>(null);

  const submit = form.handleSubmit((values) => {
    const changes: SettingChanges = { set: {}, reset: [] };
    for (const key of changed) {
      const draft = values[fieldName(key)];
      if (draft?.kind === FieldDraftKind.own) changes.set[key] = draft.value;
      else changes.reset.push(key);
    }
    const shortened = shortenings(entries, values, changed);
    if (shortened.length > 0) setConfirming({ changes, shortened });
    else mutation.mutate(changes);
  });

  const blocker = useBlocker({
    // An anchor on the same page is no departure (decision 9).
    shouldBlockFn: ({ current, next }) => dirty && current.pathname !== next.pathname,
    enableBeforeUnload: () => dirty,
    withResolver: true,
  });

  useSettingAnchor(entries.map((e) => e.key));

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6 [&_*]:scroll-mb-24">
      {sections.map(({ section, items }) => (
        <section
          key={section}
          aria-labelledby={`section-${section}`}
          className="rounded-lg border bg-background"
        >
          <h2 id={`section-${section}`} className="border-b px-5 py-3 font-semibold">
            {t(($) => $['settings-ui'].sections[section])}
          </h2>
          <div className="divide-y px-5">
            {items.map((entry) => (
              <TopicField
                key={entry.key}
                entry={entry}
                scope={view.scope}
                form={form}
                originLink={originLink}
              />
            ))}
          </div>
        </section>
      ))}

      <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-lg border bg-background/95 px-5 py-3 shadow-sm backdrop-blur">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {dirty
            ? t(($) => $['settings-ui'].save_bar.dirty, { count: changed.size })
            : t(($) => $['settings-ui'].save_bar.clean)}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!dirty || mutation.isPending}
            onClick={() => form.reset(undefined, EXACT)}
          >
            {t(($) => $['settings-ui'].save_bar.discard)}
          </Button>
          <Button type="submit" disabled={!dirty || mutation.isPending}>
            {mutation.isPending ? <Spinner /> : null}
            {t(($) => $['settings-ui'].save)}
          </Button>
        </div>
      </div>

      <RetentionDialog
        shortened={confirming?.shortened ?? []}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) mutation.mutate(confirming.changes);
          setConfirming(null);
        }}
      />

      {/* A blocked navigation is the only state with a resolver to call. */}
      <AlertDialog open={blocker.proceed !== undefined}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(($) => $['settings-ui'].leave.title)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(($) => $['settings-ui'].leave.description)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>
              {t(($) => $['settings-ui'].leave.stay)}
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => blocker.proceed?.()}>
              {t(($) => $['settings-ui'].leave.leave)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

function TopicField({
  entry,
  scope,
  form,
  originLink,
}: {
  entry: SettingEntry;
  scope: SettingsView['scope'];
  form: ReturnType<typeof useForm<Drafts>>;
  originLink?: OriginLink;
}) {
  const { t } = useTranslation();
  const spec = controlOf(entry.key, settingDef(entry.key).schema);
  const display = useValueText(entry.key, spec);
  const message = useSettingMessage(spec);
  const label = t(settingLabelKey(entry.key, LabelPart.label) as never) as string;
  const unit = unitOf(entry.key);
  return (
    <Controller
      name={fieldName(entry.key)}
      control={form.control}
      render={({ field, fieldState }) => {
        const draft = field.value as FieldDraft;
        const pendingInherit = draft.kind === FieldDraftKind.inherit && entry.source === scope;
        const inheritedText = display(entry.inherited.value);
        return (
          <SettingField
            settingKey={entry.key}
            label={label}
            description={t(settingLabelKey(entry.key, LabelPart.description) as never) as string}
            overridden={draft.kind === FieldDraftKind.own && entry.source === scope}
            group={spec.kind === SettingControl.list || spec.kind === SettingControl.grouped_list}
            error={message(fieldState.error)}
            control={
              <SettingInput
                settingKey={entry.key}
                spec={spec}
                unit={unit}
                value={shownValue(entry, draft)}
                onChange={(value) => field.onChange(own(value))}
                invalid={fieldState.invalid}
                inputRef={field.ref}
              />
            }
            origin={
              <SettingOrigin
                entry={entry}
                scope={scope}
                inheritedText={inheritedText}
                pendingInherit={pendingInherit}
                originLink={originLink}
              />
            }
            action={
              draft.kind === FieldDraftKind.own ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground"
                  onClick={() => field.onChange(INHERIT)}
                >
                  <Undo2Icon />
                  {t(($) => $['settings-ui'].use_inherited, { value: inheritedText })}
                </Button>
              ) : null
            }
          />
        );
      }}
    />
  );
}

function RetentionDialog({
  shortened,
  onCancel,
  onConfirm,
}: {
  shortened: Shortening[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  return (
    <AlertDialog open={shortened.length > 0} onOpenChange={(open) => (open ? null : onCancel())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(($) => $['settings-ui'].retention.title)}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(($) => $['settings-ui'].retention.description)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="flex flex-col gap-1 text-sm">
          {shortened.map(({ key, from, to }) => {
            const unit = unitOf(key);
            return (
              <li key={key}>
                {t(($) => $['settings-ui'].retention.change, {
                  label: t(settingLabelKey(key, LabelPart.label) as never) as string,
                  from: format.number(from),
                  to: format.number(to),
                  unit: unit ? t(($) => $['settings-ui'].unit_names[unit]) : '',
                })}
              </li>
            );
          })}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            {t(($) => $['settings-ui'].retention.cancel)}
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {t(($) => $['settings-ui'].retention.confirm)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Opens the field the URL's hash names (decision 7): scrolls its title below the sticky header,
 * focuses it, so the next Tab reaches the input, and highlights the field for 2 s. Unknown
 * hashes are ignored.
 */
export function useSettingAnchor(keys: readonly SettingKey[]) {
  const hash = useLocation({ select: (l) => l.hash });
  // Navigating to the current URL only reloads the router, so choosing the same search result
  // again counts resolved navigations rather than hash changes.
  const router = useRouter();
  const [visit, setVisit] = useState(0);
  useEffect(() => router.subscribe('onResolved', () => setVisit((n) => n + 1)), [router]);
  const known = keys.join(' ');
  // biome-ignore lint/correctness/useExhaustiveDependencies: `visit` re-opens the field on a navigation to the same URL
  useEffect(() => {
    const key = decodeURIComponent(hash);
    if (!known.split(' ').includes(key)) return;
    const title = document.getElementById(key);
    const field = title?.closest('[data-setting]');
    if (!title || !field) return;
    title.scrollIntoView({ block: 'start' });
    title.focus({ preventScroll: true });
    field.setAttribute('data-highlighted', '');
    const timer = setTimeout(() => field.removeAttribute('data-highlighted'), 2000);
    return () => {
      clearTimeout(timer);
      field.removeAttribute('data-highlighted');
    };
  }, [hash, visit, known]);
}
