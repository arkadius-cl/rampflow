import { zodResolver } from '@hookform/resolvers/zod';
import type { Block, PictogramId } from '@rampflow/shared/modules/safety/api.authoring';
import {
  AcknowledgementBody,
  type DriverBriefing,
  type DriverBriefingContent,
} from '@rampflow/shared/modules/safety/api.driver';
import { InstructionSafety, TranslationState } from '@rampflow/shared/modules/safety/values';
import { CheckIcon, ChevronRightIcon, CircleAlertIcon, LanguagesIcon, XIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';
import { DriverShell, type DriverShellProps } from '@/components/driver-shell';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n';

// SF-04 on the phone or the gate's device: read every rule, answer the quiz when there is one,
// type the name and tick the statement, once per instruction still missing. A failed quiz goes
// back to the rules; the server counts every attempt.

const pictograms = import.meta.glob<string>(
  '../../../../packages/shared/src/assets/pictograms/*.svg',
  { eager: true, query: '?url', import: 'default' },
);
const pictogramUrl = (id: PictogramId) =>
  pictograms[`../../../../packages/shared/src/assets/pictograms/${id}.svg`];

/** One screen of the briefing: a pictogram, its text, or both. */
type Rule = { pictogram?: PictogramId; text?: string };

export function rulesOf(blocks: readonly Block[]): Rule[] {
  const rules: Rule[] = [];
  for (const block of blocks) {
    const last = rules.at(-1);
    if (block.kind === 'pictogram') rules.push({ pictogram: block.id });
    else if (last && last.text === undefined) last.text = block.text;
    else rules.push({ text: block.text });
  }
  return rules;
}

type Step =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'rules'; index: number; failed: boolean }
  | { kind: 'quiz' }
  | { kind: 'confirm' };

interface Props {
  shell: Omit<DriverShellProps, 'children' | 'footer'>;
  onClose: () => void;
  onDone: () => void;
}

export default function BriefingFlow({ shell, onClose, onDone }: Props) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [queue, setQueue] = useState<DriverBriefing[] | null>(null);
  const [content, setContent] = useState<DriverBriefingContent | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const current = queue?.[0];
  const instructionId = current?.instructionId;
  // The app re-renders on every poll; only a new instruction or language reloads the content.
  const done = useRef(onDone);
  done.current = onDone;

  const loadQueue = useCallback(() => {
    setStep({ kind: 'loading' });
    api
      .briefings()
      .then(({ items }) => setQueue(items.filter((i) => i.status === InstructionSafety.missing)))
      .catch(() => setStep({ kind: 'error' }));
  }, []);
  useEffect(loadQueue, [loadQueue]);

  useEffect(() => {
    if (!queue) return;
    if (!instructionId) {
      done.current();
      return;
    }
    setStep({ kind: 'loading' });
    api
      .briefing(instructionId, locale)
      .then((c) => {
        setContent(c);
        setStep({ kind: 'rules', index: 0, failed: false });
      })
      .catch(() => setStep({ kind: 'error' }));
  }, [queue, instructionId, locale]);

  const next = () => setQueue((q) => q?.slice(1) ?? null);

  if (step.kind === 'loading' || step.kind === 'error' || !content || !current) {
    return (
      <DriverShell {...shell} footer={<CloseButton onClose={onClose} />}>
        {step.kind === 'error' ? (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>{t(($) => $.briefing.error)}</AlertTitle>
            <Button variant="outline" className="mt-3" onClick={loadQueue}>
              {t(($) => $.briefing.retry)}
            </Button>
          </Alert>
        ) : (
          <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
            <Spinner /> {t(($) => $.briefing.loading)}
          </div>
        )}
      </DriverShell>
    );
  }

  const quiz = content.questions.length > 0;
  const header = (
    <div className="flex items-start justify-between gap-2">
      <h1 className="text-xl font-semibold leading-tight">{content.title}</h1>
      <Button variant="ghost" size="icon" aria-label={t(($) => $.briefing.close)} onClick={onClose}>
        <XIcon aria-hidden />
      </Button>
    </div>
  );
  const machine =
    content.translation === TranslationState.machine ? (
      <p className="flex items-center gap-2 text-sm text-tone-onsite">
        <LanguagesIcon aria-hidden className="size-4 shrink-0" />
        {t(($) => $.briefing.machine)}
      </p>
    ) : null;

  if (step.kind === 'rules') {
    return (
      <Rules
        shell={shell}
        header={header}
        machine={machine}
        content={content}
        index={step.index}
        failed={step.failed}
        quiz={quiz}
        onIndex={(index) => setStep({ kind: 'rules', index, failed: step.failed })}
        onRead={() => setStep({ kind: quiz ? 'quiz' : 'confirm' })}
      />
    );
  }
  if (step.kind === 'quiz') {
    return (
      <Quiz
        key={current.instructionId}
        shell={shell}
        header={header}
        content={content}
        onPassed={() => setStep({ kind: 'confirm' })}
        onFailed={() => setStep({ kind: 'rules', index: 0, failed: true })}
      />
    );
  }
  return (
    <Confirm
      key={current.instructionId}
      shell={shell}
      header={header}
      content={content}
      instructionId={current.instructionId}
      onConfirmed={next}
    />
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Button variant="outline" size="lg" className="h-12 w-full" onClick={onClose}>
      {t(($) => $.briefing.close)}
    </Button>
  );
}

function Rules(p: {
  shell: Props['shell'];
  header: React.ReactNode;
  machine: React.ReactNode;
  content: DriverBriefingContent;
  index: number;
  failed: boolean;
  quiz: boolean;
  onIndex: (index: number) => void;
  onRead: () => void;
}) {
  const { t } = useTranslation();
  const rules = rulesOf(p.content.blocks);
  const rule = rules[p.index] ?? {};
  const last = p.index >= rules.length - 1;
  return (
    <DriverShell
      {...p.shell}
      footer={
        last ? (
          <Button size="lg" className="h-13 w-full text-base" onClick={p.onRead}>
            {p.quiz ? t(($) => $.briefing.to_quiz) : t(($) => $.briefing.to_confirm)}
            <ChevronRightIcon aria-hidden />
          </Button>
        ) : (
          <Button
            size="lg"
            className="h-13 w-full text-base"
            onClick={() => p.onIndex(p.index + 1)}
          >
            {t(($) => $.briefing.next)}
            <ChevronRightIcon aria-hidden />
          </Button>
        )
      }
    >
      {p.header}
      {p.failed ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>{t(($) => $.briefing.quiz.failed)}</AlertTitle>
        </Alert>
      ) : null}
      {p.machine}
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{t(($) => $.briefing.title)}</span>
        <span className="text-muted-foreground tabular-nums">
          {t(($) => $.briefing.progress, { current: p.index + 1, total: rules.length })}
        </span>
      </div>
      <Progress
        value={((p.index + 1) / Math.max(1, rules.length)) * 100}
        aria-label={t(($) => $.briefing.progress_label)}
      />
      <section className="flex flex-1 flex-col gap-4 rounded-xl border bg-card p-5">
        {rule.pictogram ? (
          <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-tone-onsite-bg">
            <img
              src={pictogramUrl(rule.pictogram)}
              alt={t(($) => $.briefing.pictogram[rule.pictogram as PictogramId])}
              className="size-36"
            />
          </div>
        ) : null}
        {rule.text ? <p className="text-lg leading-snug">{rule.text}</p> : null}
      </section>
      {p.index > 0 ? (
        <Button variant="outline" size="lg" onClick={() => p.onIndex(p.index - 1)}>
          {t(($) => $.briefing.back)}
        </Button>
      ) : null}
    </DriverShell>
  );
}

function Quiz(p: {
  shell: Props['shell'];
  header: React.ReactNode;
  content: DriverBriefingContent;
  onPassed: () => void;
  onFailed: () => void;
}) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const complete = p.content.questions.every((q) => answers[q.id] !== undefined);
  const check = async () => {
    setBusy(true);
    setError(false);
    try {
      const result = await api.attempt(p.content.instructionId, {
        locale: p.content.locale,
        answers,
      });
      if (result.passed) p.onPassed();
      else p.onFailed();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <DriverShell
      {...p.shell}
      footer={
        <Button
          size="lg"
          className="h-13 w-full text-base"
          disabled={!complete || busy}
          onClick={() => void check()}
        >
          {busy ? <Spinner /> : <CheckIcon aria-hidden />}
          {t(($) => $.briefing.quiz.check)}
        </Button>
      }
    >
      {p.header}
      <div className="text-sm">
        <h2 className="font-medium">{t(($) => $.briefing.quiz.title)}</h2>
        <p className="text-muted-foreground">{t(($) => $.briefing.quiz.hint)}</p>
      </div>
      {error ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>{t(($) => $.briefing.error)}</AlertTitle>
        </Alert>
      ) : null}
      {p.content.questions.map((q, i) => (
        <fieldset key={q.id} className="rounded-xl border bg-card p-4">
          <legend className="sr-only">{t(($) => $.briefing.quiz.question, { n: i + 1 })}</legend>
          <div className="mb-3 flex items-start gap-2">
            <span
              aria-hidden
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold"
            >
              {i + 1}
            </span>
            <span id={`${q.id}-prompt`} className="text-lg font-medium leading-snug">
              {q.prompt}
            </span>
          </div>
          <RadioGroup
            aria-labelledby={`${q.id}-prompt`}
            value={answers[q.id] === undefined ? '' : String(answers[q.id])}
            onValueChange={(v) => setAnswers({ ...answers, [q.id]: Number(v) })}
          >
            {q.options.map((option, j) => (
              <label
                key={option}
                htmlFor={`${q.id}-${j}`}
                className="flex min-h-12 items-center gap-3 rounded-lg border px-3 text-base has-data-checked:border-primary has-data-checked:bg-accent"
              >
                <RadioGroupItem id={`${q.id}-${j}`} value={String(j)} className="size-6" />
                <span className="flex-1">{option}</span>
              </label>
            ))}
          </RadioGroup>
        </fieldset>
      ))}
    </DriverShell>
  );
}

const ConfirmForm = z.object({
  name: AcknowledgementBody.shape.name,
  confirmed: z.boolean().refine((v) => v),
});
type ConfirmForm = z.infer<typeof ConfirmForm>;

function Confirm(p: {
  shell: Props['shell'];
  header: React.ReactNode;
  content: DriverBriefingContent;
  instructionId: string;
  onConfirmed: () => void;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState(false);
  const form = useForm<ConfirmForm>({
    resolver: zodResolver(ConfirmForm),
    defaultValues: { name: '', confirmed: false },
  });
  const submit = form.handleSubmit(async ({ name }) => {
    setError(false);
    try {
      await api.acknowledge(p.instructionId, { locale: p.content.locale, name, confirmed: true });
      p.onConfirmed();
    } catch {
      setError(true);
    }
  });
  return (
    <DriverShell
      {...p.shell}
      footer={
        <Button
          type="submit"
          form="briefing-confirm"
          size="lg"
          className="h-13 w-full text-base"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? <Spinner /> : <CheckIcon aria-hidden />}
          {t(($) => $.briefing.confirm.submit)}
        </Button>
      }
    >
      {p.header}
      <h2 className="text-lg font-semibold">{t(($) => $.briefing.confirm.title)}</h2>
      {error ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>{t(($) => $.briefing.error)}</AlertTitle>
        </Alert>
      ) : null}
      <form id="briefing-confirm" noValidate onSubmit={(e) => void submit(e)}>
        <FieldGroup className="rounded-xl border bg-card p-4">
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="driver-name">{t(($) => $.briefing.confirm.name)}</FieldLabel>
                <Input
                  {...field}
                  id="driver-name"
                  autoComplete="name"
                  placeholder={t(($) => $.briefing.confirm.name_placeholder)}
                  className="h-12 text-base"
                  aria-invalid={fieldState.invalid}
                />
                <FieldError>
                  {fieldState.error ? t(($) => $.briefing.confirm.name_error) : null}
                </FieldError>
              </Field>
            )}
          />
          <Controller
            name="confirmed"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field orientation="horizontal" data-invalid={fieldState.invalid}>
                <Checkbox
                  id="driver-confirm"
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                  aria-invalid={fieldState.invalid}
                  className="mt-1"
                />
                <FieldLabel htmlFor="driver-confirm" className="text-base font-normal">
                  {p.content.statement}
                </FieldLabel>
                <FieldError>
                  {fieldState.error ? t(($) => $.briefing.confirm.statement_error) : null}
                </FieldError>
              </Field>
            )}
          />
        </FieldGroup>
      </form>
    </DriverShell>
  );
}
