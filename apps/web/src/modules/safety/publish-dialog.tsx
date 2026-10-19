import type { VersionDetail } from '@rampflow/shared/modules/safety/api.authoring';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { errorText } from '@/components/app-shell/form-errors';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { ApiFailure, api, call } from '@/lib/api';
import { useLanguageName } from './display';
import { safetyKey } from './queries';

/** SF-01, SF-02: publishes a draft, with or without the material-change flag. */
export function PublishDialog({
  orgId,
  version,
  open,
  onOpenChange,
}: {
  orgId: string;
  version: VersionDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('safety');
  const { t: tCore } = useTranslation('core');
  const languageName = useLanguageName();
  const queryClient = useQueryClient();
  const [materialChange, setMaterialChange] = useState(false);
  const publish = useMutation({
    mutationFn: () =>
      call<VersionDetail>(
        api.t[':orgId'].safety.versions[':versionId'].publish.$post({
          param: { orgId, versionId: version.id },
          json: { materialChange },
        }),
      ),
    meta: { silent: true },
    onSuccess: async (published) => {
      await queryClient.invalidateQueries({ queryKey: safetyKey(orgId) });
      onOpenChange(false);
      toast.success(t(($) => $.editor.publish.done, { version: published.version }));
    },
    onError: (e) => {
      if (e instanceof ApiFailure && e.reason !== 'quiz_incomplete')
        toast.error(errorText(tCore, e));
    },
  });
  const failure = publish.error instanceof ApiFailure ? publish.error : null;
  const incomplete =
    failure?.reason === 'quiz_incomplete' && Array.isArray(failure.details.locales)
      ? (failure.details.locales as string[])
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(($) => $.editor.publish.title, { version: version.version })}
          </DialogTitle>
          <DialogDescription>{t(($) => $.editor.publish.description)}</DialogDescription>
        </DialogHeader>
        {incomplete ? (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertDescription>
              {t(($) => $.editor.publish.incomplete, {
                min: failure?.details.min as number,
                max: failure?.details.max as number,
                languages: incomplete.map(languageName).join(', '),
              })}
            </AlertDescription>
          </Alert>
        ) : null}
        <Field orientation="horizontal">
          <Switch
            id="publish-material"
            checked={materialChange}
            onCheckedChange={setMaterialChange}
          />
          <FieldContent>
            <FieldLabel htmlFor="publish-material">
              {t(($) => $.editor.publish.material)}
            </FieldLabel>
            <FieldDescription>{t(($) => $.editor.publish.material_hint)}</FieldDescription>
          </FieldContent>
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t(($) => $.editor.publish.cancel)}
          </Button>
          <Button disabled={publish.isPending} onClick={() => publish.mutate()}>
            {publish.isPending ? <Spinner /> : null}
            {t(($) => $.editor.publish.confirm)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
