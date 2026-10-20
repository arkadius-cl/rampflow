import { zodResolver } from '@hookform/resolvers/zod';
import type { ContextSite } from '@rampflow/shared/modules/core/api.context';
import {
  CreateInstructionBody,
  type Instruction,
} from '@rampflow/shared/modules/safety/api.authoring';
import { SiteSelection } from '@rampflow/shared/modules/safety/values';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type * as z from 'zod';
import { applyServerIssues, useFieldMessage } from '@/components/app-shell/form-errors';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { api, call } from '@/lib/api';
import { safetyKey } from './queries';

type FormInput = z.input<typeof CreateInstructionBody>;
type FormOutput = z.output<typeof CreateInstructionBody>;

/**
 * SF-01: creates an instruction (version 1 from the platform template), or changes the name and
 * sites of `instruction`. Calls `onSaved` with the saved instruction.
 */
export function InstructionDialog({
  orgId,
  sites,
  instruction,
  open,
  onOpenChange,
  onSaved,
}: {
  orgId: string;
  sites: readonly ContextSite[];
  instruction?: Instruction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (instruction: Instruction) => void;
}) {
  const { t } = useTranslation('safety');
  const message = useFieldMessage();
  const queryClient = useQueryClient();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(CreateInstructionBody),
    defaultValues: {
      name: instruction?.name ?? '',
      allSites: instruction?.allSites ?? true,
      siteIds: instruction?.siteIds ?? [],
    },
  });
  const allSites = useWatch({ control: form.control, name: 'allSites' });
  const save = useMutation({
    mutationFn: (body: FormOutput) => {
      const safety = api.t[':orgId'].safety;
      return instruction
        ? call<Instruction>(
            safety.instructions[':instructionId'].$patch({
              param: { orgId, instructionId: instruction.id },
              json: body,
            }),
          )
        : call<Instruction>(safety.instructions.$post({ param: { orgId }, json: body }));
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: safetyKey(orgId) });
      onOpenChange(false);
      onSaved(saved);
    },
    onError: (e) => applyServerIssues(e, form.setError),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form noValidate onSubmit={form.handleSubmit((body) => save.mutate(body))}>
          <DialogHeader>
            <DialogTitle>
              {instruction
                ? t(($) => $.briefings.form.edit_title)
                : t(($) => $.briefings.form.create_title)}
            </DialogTitle>
            {instruction ? null : (
              <DialogDescription>{t(($) => $.briefings.form.create_description)}</DialogDescription>
            )}
          </DialogHeader>
          <FieldGroup className="py-4">
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="instruction-name">
                    {t(($) => $.briefings.form.name)}
                  </FieldLabel>
                  <Input {...field} id="instruction-name" aria-invalid={fieldState.invalid} />
                  <FieldError>{message(fieldState.error)}</FieldError>
                </Field>
              )}
            />
            <Controller
              name="allSites"
              control={form.control}
              render={({ field }) => (
                <FieldSet>
                  <FieldLegend variant="label">{t(($) => $.briefings.form.applies_to)}</FieldLegend>
                  <RadioGroup
                    value={field.value ? SiteSelection.all : SiteSelection.chosen}
                    onValueChange={(v) => {
                      field.onChange(v === SiteSelection.all);
                      // The API takes site ids only together with `allSites: false`.
                      if (v === SiteSelection.all) form.setValue('siteIds', []);
                    }}
                  >
                    <Field orientation="horizontal">
                      <RadioGroupItem value={SiteSelection.all} id="instruction-all-sites" />
                      <FieldLabel htmlFor="instruction-all-sites" className="font-normal">
                        {t(($) => $.briefings.form.all_sites)}
                      </FieldLabel>
                    </Field>
                    <Field orientation="horizontal">
                      <RadioGroupItem value={SiteSelection.chosen} id="instruction-chosen-sites" />
                      <FieldLabel htmlFor="instruction-chosen-sites" className="font-normal">
                        {t(($) => $.briefings.form.chosen_sites)}
                      </FieldLabel>
                    </Field>
                  </RadioGroup>
                </FieldSet>
              )}
            />
            {allSites ? null : (
              <Controller
                name="siteIds"
                control={form.control}
                render={({ field, fieldState }) => (
                  <FieldSet data-invalid={fieldState.invalid} className="pl-6">
                    <FieldLegend className="sr-only">
                      {t(($) => $.briefings.form.chosen_sites)}
                    </FieldLegend>
                    {sites.map((site) => {
                      const checked = (field.value ?? []).includes(site.id);
                      return (
                        <Field key={site.id} orientation="horizontal">
                          <Checkbox
                            id={`instruction-site-${site.id}`}
                            checked={checked}
                            onCheckedChange={(on) =>
                              field.onChange(
                                on
                                  ? [...(field.value ?? []), site.id]
                                  : (field.value ?? []).filter((id) => id !== site.id),
                              )
                            }
                          />
                          <FieldContent>
                            <FieldLabel
                              htmlFor={`instruction-site-${site.id}`}
                              className="font-normal"
                            >
                              {site.name}
                            </FieldLabel>
                          </FieldContent>
                        </Field>
                      );
                    })}
                    <FieldError>
                      {fieldState.error ? t(($) => $.briefings.form.sites_required) : null}
                    </FieldError>
                  </FieldSet>
                )}
              />
            )}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t(($) => $.briefings.form.cancel)}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Spinner /> : null}
              {instruction ? t(($) => $.briefings.form.save) : t(($) => $.briefings.form.create)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
