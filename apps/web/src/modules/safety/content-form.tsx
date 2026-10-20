import { zodResolver } from '@hookform/resolvers/zod';
import {
  type Content,
  ContentBody,
  QUIZ_QUESTIONS,
} from '@rampflow/shared/modules/safety/api.authoring';
import { PictogramId, TranslationState } from '@rampflow/shared/modules/safety/values';
import { values } from '@rampflow/shared/values';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ImageIcon,
  PlusIcon,
  TextIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import {
  type Control,
  Controller,
  type FieldErrors,
  useFieldArray,
  useForm,
  useWatch,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type * as z from 'zod';
import { applyServerIssues, useFieldMessage } from '@/components/app-shell/form-errors';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { api, call } from '@/lib/api';
import { randomId } from '@/lib/utils';
import { Pictogram, useLanguageName, usePictogramName } from './display';
import { safetyKey } from './queries';

// SF-01, SF-02: the content of one version in one language: translation flag, title, rules
// (text and pictogram blocks), confirmation statement, and with `safety.quiz` the questions.
// Published and retired versions render the same form read-only.

type ContentInput = z.input<typeof ContentBody>;
type Output = z.output<typeof ContentBody>;

const toForm = ({ locale: _locale, contentHash: _hash, ...body }: Content): ContentInput => body;

const newQuestion = () => ({
  id: randomId(),
  prompt: '',
  options: ['', ''],
  correct: 0,
});

export function ContentForm({
  orgId,
  versionId,
  content,
  readOnly,
  quiz,
}: {
  orgId: string;
  versionId: string;
  content: Content;
  readOnly: boolean;
  /** `safety.quiz` is on. Without it the form neither shows nor sends questions. */
  quiz: boolean;
}) {
  const { t } = useTranslation('safety');
  const message = useFieldMessage();
  const language = useLanguageName()(content.locale);
  const queryClient = useQueryClient();
  const form = useForm<ContentInput, unknown, Output>({
    resolver: zodResolver(ContentBody),
    defaultValues: toForm(content),
    disabled: readOnly,
  });
  const blocks = useFieldArray({ control: form.control, name: 'blocks', keyName: 'key' });
  const questions = useFieldArray({ control: form.control, name: 'questions', keyName: 'key' });
  const save = useMutation({
    mutationFn: (body: Output) =>
      call<Content>(
        api.t[':orgId'].safety.versions[':versionId'].content[':locale'].$put({
          param: { orgId, versionId, locale: content.locale },
          json: quiz ? body : { ...body, questions: [] },
        }),
      ),
    onSuccess: async (saved) => {
      form.reset(toForm(saved));
      await queryClient.invalidateQueries({ queryKey: safetyKey(orgId) });
      toast.success(t(($) => $.editor.saved, { language }));
    },
    onError: (e) => applyServerIssues(e, form.setError),
  });
  const id = (suffix: string) => `content-${content.locale}-${suffix}`;

  return (
    <form noValidate onSubmit={form.handleSubmit((body) => save.mutate(body))}>
      <FieldGroup>
        <Controller
          name="translation"
          control={form.control}
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor={id('translation')}>
                {t(($) => $.editor.fields.translation)}
              </FieldLabel>
              <NativeSelect {...field} id={id('translation')}>
                {values(TranslationState).map((state) => (
                  <NativeSelectOption key={state} value={state}>
                    {t(($) => $.editor.translation[state])}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>{t(($) => $.editor.fields.translation_hint)}</FieldDescription>
            </Field>
          )}
        />
        <Controller
          name="title"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={id('title')}>{t(($) => $.editor.fields.title)}</FieldLabel>
              <Input {...field} id={id('title')} aria-invalid={fieldState.invalid} />
              <FieldError>{message(fieldState.error)}</FieldError>
            </Field>
          )}
        />

        <FieldSet>
          <FieldLegend>{t(($) => $.editor.fields.blocks)}</FieldLegend>
          <FieldDescription>{t(($) => $.editor.fields.blocks_hint)}</FieldDescription>
          <ol className="flex flex-col gap-3">
            {blocks.fields.map((block, index) => (
              <li key={block.key} className="rounded-lg border bg-background p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t(($) => $.editor.block.label, { n: index + 1 })} ·{' '}
                    {block.kind === 'text'
                      ? t(($) => $.editor.block.text)
                      : t(($) => $.editor.block.pictogram)}
                  </span>
                  {readOnly ? null : (
                    <div className="ml-auto flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={index === 0}
                        aria-label={`${t(($) => $.editor.block.move_up)}: ${t(($) => $.editor.block.label, { n: index + 1 })}`}
                        onClick={() => blocks.move(index, index - 1)}
                      >
                        <ArrowUpIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={index === blocks.fields.length - 1}
                        aria-label={`${t(($) => $.editor.block.move_down)}: ${t(($) => $.editor.block.label, { n: index + 1 })}`}
                        onClick={() => blocks.move(index, index + 1)}
                      >
                        <ArrowDownIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={blocks.fields.length === 1}
                        aria-label={`${t(($) => $.editor.block.remove)}: ${t(($) => $.editor.block.label, { n: index + 1 })}`}
                        onClick={() => blocks.remove(index)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  )}
                </div>
                {block.kind === 'text' ? (
                  <TextBlock control={form.control} index={index} label={id(`block-${index}`)} />
                ) : (
                  <PictogramBlock
                    control={form.control}
                    index={index}
                    label={id(`block-${index}`)}
                  />
                )}
              </li>
            ))}
          </ol>
          {readOnly ? null : (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => blocks.append({ kind: 'text', text: '' })}
              >
                <TextIcon /> {t(($) => $.editor.block.add_text)}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => blocks.append({ kind: 'pictogram', id: values(PictogramId)[0] })}
              >
                <ImageIcon /> {t(($) => $.editor.block.add_pictogram)}
              </Button>
            </div>
          )}
        </FieldSet>

        <Controller
          name="statement"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={id('statement')}>
                {t(($) => $.editor.fields.statement)}
              </FieldLabel>
              <Textarea
                {...field}
                id={id('statement')}
                rows={2}
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>{t(($) => $.editor.fields.statement_hint)}</FieldDescription>
              <FieldError>{message(fieldState.error)}</FieldError>
            </Field>
          )}
        />

        {quiz ? (
          <FieldSet>
            <FieldLegend>{t(($) => $.editor.quiz.title)}</FieldLegend>
            <FieldDescription>{t(($) => $.editor.quiz.hint, QUIZ_QUESTIONS)}</FieldDescription>
            <ol className="flex flex-col gap-3">
              {questions.fields.map((question, index) => (
                <li key={question.key} className="rounded-lg border bg-background p-3">
                  <QuestionEditor
                    control={form.control}
                    index={index}
                    idPrefix={id(`question-${index}`)}
                    readOnly={readOnly}
                    errors={form.formState.errors}
                    onRemove={() => questions.remove(index)}
                  />
                </li>
              ))}
            </ol>
            {readOnly ? null : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                disabled={questions.fields.length >= QUIZ_QUESTIONS.max}
                onClick={() => questions.append(newQuestion())}
              >
                <PlusIcon /> {t(($) => $.editor.quiz.add_question)}
              </Button>
            )}
          </FieldSet>
        ) : (
          <p className="text-sm text-muted-foreground">{t(($) => $.editor.quiz.unavailable)}</p>
        )}

        {readOnly ? null : (
          <div className="flex items-center justify-end gap-3">
            {form.formState.isDirty ? (
              <span className="text-sm text-muted-foreground">{t(($) => $.editor.unsaved)}</span>
            ) : null}
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Spinner /> : null}
              {t(($) => $.editor.save, { language })}
            </Button>
          </div>
        )}
      </FieldGroup>
    </form>
  );
}

function TextBlock({
  control,
  index,
  label,
}: {
  control: Control<ContentInput, unknown, Output>;
  index: number;
  label: string;
}) {
  const { t } = useTranslation('safety');
  const message = useFieldMessage();
  return (
    <Controller
      name={`blocks.${index}.text`}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={label} className="sr-only">
            {t(($) => $.editor.block.label, { n: index + 1 })}
          </FieldLabel>
          <Textarea
            {...field}
            value={field.value ?? ''}
            id={label}
            rows={3}
            aria-invalid={fieldState.invalid}
          />
          <FieldError>{message(fieldState.error)}</FieldError>
        </Field>
      )}
    />
  );
}

function PictogramBlock({
  control,
  index,
  label,
}: {
  control: Control<ContentInput, unknown, Output>;
  index: number;
  label: string;
}) {
  const { t } = useTranslation('safety');
  const name = usePictogramName();
  const value = useWatch({ control, name: `blocks.${index}.id` }) as PictogramId;
  return (
    <Controller
      name={`blocks.${index}.id`}
      control={control}
      render={({ field }) => (
        <Field orientation="horizontal">
          <Pictogram id={value} label="" />
          <FieldLabel htmlFor={label} className="sr-only">
            {t(($) => $.editor.block.label, { n: index + 1 })}
          </FieldLabel>
          <NativeSelect {...field} id={label}>
            {values(PictogramId).map((id) => (
              <NativeSelectOption key={id} value={id}>
                {name(id)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      )}
    />
  );
}

function QuestionEditor({
  control,
  index,
  idPrefix,
  readOnly,
  errors,
  onRemove,
}: {
  control: Control<ContentInput, unknown, Output>;
  index: number;
  idPrefix: string;
  readOnly: boolean;
  errors: FieldErrors<ContentInput>;
  onRemove: () => void;
}) {
  const { t } = useTranslation('safety');
  const message = useFieldMessage();
  const optionErrors = errors.questions?.[index]?.options;
  const title = t(($) => $.editor.quiz.question, { n: index + 1 });
  return (
    <fieldset aria-labelledby={`${idPrefix}-title`} className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 id={`${idPrefix}-title`} className="text-sm font-medium">
          {title}
        </h3>
        {readOnly ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`${t(($) => $.editor.quiz.remove_question)}: ${title}`}
            onClick={onRemove}
          >
            <Trash2Icon /> {t(($) => $.editor.quiz.remove_question)}
          </Button>
        )}
      </div>
      <Controller
        name={`questions.${index}.prompt`}
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${idPrefix}-prompt`}>{t(($) => $.editor.quiz.prompt)}</FieldLabel>
            <Input {...field} id={`${idPrefix}-prompt`} aria-invalid={fieldState.invalid} />
            <FieldError>{message(fieldState.error)}</FieldError>
          </Field>
        )}
      />
      <Controller
        name={`questions.${index}.correct`}
        control={control}
        render={({ field: correct }) => (
          <Controller
            name={`questions.${index}.options`}
            control={control}
            render={({ field }) => {
              const options = field.value ?? [];
              const setOption = (n: number, text: string) =>
                field.onChange(options.map((o, i) => (i === n ? text : o)));
              const removeOption = (n: number) => {
                field.onChange(options.filter((_, i) => i !== n));
                const at = correct.value ?? 0;
                if (at >= n && at > 0) correct.onChange(at === n ? 0 : at - 1);
              };
              return (
                <FieldSet>
                  <FieldLegend variant="label" className="sr-only">
                    {t(($) => $.editor.quiz.correct)}
                  </FieldLegend>
                  <RadioGroup
                    value={String(correct.value ?? 0)}
                    onValueChange={(v) => correct.onChange(Number(v))}
                    disabled={readOnly}
                  >
                    {options.map((option, n) => {
                      const optionId = `${idPrefix}-option-${n}`;
                      const label = t(($) => $.editor.quiz.option, { n: n + 1 });
                      return (
                        // biome-ignore lint/suspicious/noArrayIndexKey: options are plain strings without ids
                        <Field key={n} orientation="horizontal" data-invalid={!!optionErrors?.[n]}>
                          <RadioGroupItem
                            value={String(n)}
                            id={`${optionId}-correct`}
                            aria-label={`${t(($) => $.editor.quiz.correct)}: ${label}`}
                          />
                          <FieldLabel htmlFor={optionId} className="sr-only">
                            {label}
                          </FieldLabel>
                          <Input
                            id={optionId}
                            value={option}
                            disabled={readOnly}
                            placeholder={label}
                            aria-invalid={!!optionErrors?.[n]}
                            onChange={(e) => setOption(n, e.target.value)}
                          />
                          {readOnly ? null : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              disabled={options.length <= 2}
                              aria-label={t(($) => $.editor.quiz.remove_option, { n: n + 1 })}
                              onClick={() => removeOption(n)}
                            >
                              <XIcon />
                            </Button>
                          )}
                        </Field>
                      );
                    })}
                  </RadioGroup>
                  <FieldError>
                    {message(Array.isArray(optionErrors) ? optionErrors.find(Boolean) : undefined)}
                  </FieldError>
                  {readOnly ? null : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-fit"
                      disabled={options.length >= 4}
                      onClick={() => field.onChange([...options, ''])}
                    >
                      <PlusIcon /> {t(($) => $.editor.quiz.add_option)}
                    </Button>
                  )}
                </FieldSet>
              );
            }}
          />
        )}
      />
    </fieldset>
  );
}
