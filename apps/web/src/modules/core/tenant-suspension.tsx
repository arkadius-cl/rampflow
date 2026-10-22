import { zodResolver } from '@hookform/resolvers/zod';
import { SuspensionBody } from '@rampflow/shared/modules/core/api.platform';
import { TenantStatus } from '@rampflow/shared/modules/core/values';
import { UiSize } from '@rampflow/shared/values';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { applyServerIssues, useFieldMessage } from '@/components/app-shell/form-errors';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { platformKeys, reactivateTenant, suspendTenant } from './queries';

// PL-07: the reason sheet. One sheet for both commands: the tenant's status decides whether it
// suspends (destructive) or reactivates (default). Opened from the hub header and the row actions.

export interface SuspensionTarget {
  id: string;
  name: string;
  status: TenantStatus;
}

export function TenantSuspensionSheet({
  tenant,
  open,
  onOpenChange,
}: {
  tenant: SuspensionTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size={UiSize.sm}>
        {/* Remounts per opening, so a cancelled reason does not come back. */}
        {open ? <SuspensionForm tenant={tenant} onDone={() => onOpenChange(false)} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function SuspensionForm({ tenant, onDone }: { tenant: SuspensionTarget; onDone: () => void }) {
  const { t } = useTranslation();
  const message = useFieldMessage();
  const queryClient = useQueryClient();
  const suspending = tenant.status !== TenantStatus.suspended;
  const form = useForm<SuspensionBody>({
    resolver: zodResolver(SuspensionBody),
    defaultValues: { reason: '' },
  });
  const command = useMutation({
    mutationFn: (json: SuspensionBody) =>
      suspending ? suspendTenant(tenant.id, json) : reactivateTenant(tenant.id, json),
    onSuccess: (updated) => {
      queryClient.setQueryData(platformKeys.tenant(tenant.id), updated);
      void queryClient.invalidateQueries({ queryKey: platformKeys.tenant(tenant.id) });
      void queryClient.invalidateQueries({ queryKey: platformKeys.tenantLists() });
      toast.success(
        suspending
          ? t(($) => $.platform.suspension.suspended, { name: tenant.name })
          : t(($) => $.platform.suspension.reactivated, { name: tenant.name }),
      );
      onDone();
    },
    onError: (e) => applyServerIssues(e, form.setError),
  });
  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={form.handleSubmit((v) => command.mutate(v))}
    >
      <SheetHeader>
        <SheetTitle>
          {suspending
            ? t(($) => $.platform.suspension.suspend_title, { name: tenant.name })
            : t(($) => $.platform.suspension.reactivate_title, { name: tenant.name })}
        </SheetTitle>
        <SheetDescription>
          {suspending
            ? t(($) => $.platform.suspension.suspend_effect)
            : t(($) => $.platform.suspension.reactivate_effect)}
        </SheetDescription>
      </SheetHeader>
      <div className="flex-1 overflow-auto px-pad py-4">
        <Controller
          name="reason"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="suspension-reason">
                {t(($) => $.platform.suspension.reason)}
              </FieldLabel>
              <Textarea
                {...field}
                id="suspension-reason"
                rows={4}
                maxLength={500}
                aria-invalid={fieldState.invalid}
              />
              <FieldError>{message(fieldState.error)}</FieldError>
            </Field>
          )}
        />
      </div>
      <SheetFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t(($) => $.platform.cancel)}
        </Button>
        <Button
          type="submit"
          variant={suspending ? 'destructive' : 'default'}
          disabled={command.isPending}
        >
          {command.isPending ? <Spinner /> : null}
          {suspending
            ? t(($) => $.platform.suspension.suspend_submit)
            : t(($) => $.platform.suspension.reactivate_submit)}
        </Button>
      </SheetFooter>
    </form>
  );
}
