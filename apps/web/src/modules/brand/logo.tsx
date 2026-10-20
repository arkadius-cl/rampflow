import {
  LOGO_CONTENT_TYPES,
  LOGO_MAX_BYTES,
  type LogoResponse,
} from '@rampflow/shared/modules/brand/api';
import { ErrorCode } from '@rampflow/shared/values';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageIcon, TrashIcon, UploadIcon } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shells/office-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { api, call, isFailure } from '@/lib/api';
import { ConfirmButton } from '@/modules/core/confirm-button';
import { useFormat } from '@/modules/core/format';

// TN-05: the tenant's logo on carrier pages, emails and the driver PWA. PNG or JPEG up to 256 KB;
// the browser checks type and size first, the server checks the bytes and answers 422.

const logoKey = (orgId: string) => ['tenant', orgId, 'brand', 'logo'] as const;

export const logoQuery = (orgId: string) =>
  queryOptions({
    queryKey: logoKey(orgId),
    queryFn: () => call<LogoResponse>(api.t[':orgId'].brand.logo.$get({ param: { orgId } })),
  });

type LogoProblem = 'type' | 'size';

/** The client-side check of a chosen file. */
function problemOf(file: File): LogoProblem | null {
  if (!(LOGO_CONTENT_TYPES as readonly string[]).includes(file.type)) return 'type';
  if (file.size > LOGO_MAX_BYTES) return 'size';
  return null;
}

export function LogoScreen({ orgId }: { orgId: string }) {
  const { t } = useTranslation('brand');
  const format = useFormat();
  const queryClient = useQueryClient();
  const logo = useQuery(logoQuery(orgId));
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<LogoProblem | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const upload = useMutation({
    mutationFn: (chosen: File) =>
      call<LogoResponse>(
        fetch(`/api/t/${orgId}/brand/logo`, {
          method: 'PUT',
          body: chosen,
          headers: { 'Content-Type': chosen.type },
        }),
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(logoKey(orgId), data);
      setFile(null);
      if (input.current) input.current.value = '';
      toast.success(t(($) => $.logo.uploaded));
    },
    onError: (e) => {
      if (!isFailure(e, ErrorCode.validation_failed)) return;
      setProblem(e.issues.some((i) => i.code === 'too_big') ? 'size' : 'type');
    },
  });
  const remove = async () => {
    await call(api.t[':orgId'].brand.logo.$delete({ param: { orgId } }));
    queryClient.setQueryData<LogoResponse>(logoKey(orgId), { logo: null });
    toast.success(t(($) => $.logo.deleted));
  };

  const current = logo.data?.logo;
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title={t(($) => $.logo.title)} description={t(($) => $.logo.description)} />
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t(($) => $.logo.current)}</h2>
          </CardTitle>
          <CardDescription>{t(($) => $.logo.current_description)}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          {logo.isPending ? (
            <Skeleton className="h-24 w-48" />
          ) : current ? (
            <>
              <div className="flex h-24 min-w-48 items-center justify-center rounded-md border bg-muted/40 p-3">
                <img
                  src={current.url}
                  alt={t(($) => $.logo.preview_alt)}
                  className="max-h-full max-w-64 object-contain"
                />
              </div>
              <div className="flex flex-col gap-2 text-sm">
                <span className="text-muted-foreground">
                  {t(($) => $.logo.details, {
                    at: format.instant(current.updatedAt),
                    size: format.number(Math.ceil(current.byteSize / 1024)),
                  })}
                </span>
                <ConfirmButton
                  trigger={
                    <Button variant="outline" size="sm" className="self-start">
                      <TrashIcon /> {t(($) => $.logo.delete)}
                    </Button>
                  }
                  title={t(($) => $.logo.delete_title)}
                  description={t(($) => $.logo.delete_description)}
                  confirm={t(($) => $.logo.delete)}
                  onConfirm={remove}
                />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <ImageIcon className="size-5" aria-hidden />
              {t(($) => $.logo.none)}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t(($) => $.logo.upload_title)}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (file && !problem) upload.mutate(file);
            }}
          >
            <Field data-invalid={problem !== null}>
              <FieldLabel htmlFor={inputId}>{t(($) => $.logo.file)}</FieldLabel>
              <Input
                ref={input}
                id={inputId}
                type="file"
                accept={LOGO_CONTENT_TYPES.join(',')}
                aria-invalid={problem !== null}
                onChange={(e) => {
                  const chosen = e.target.files?.[0] ?? null;
                  setFile(chosen);
                  setProblem(chosen ? problemOf(chosen) : null);
                }}
              />
              <FieldDescription>{t(($) => $.logo.hint)}</FieldDescription>
              <FieldError>
                {problem === 'type'
                  ? t(($) => $.logo.wrong_type)
                  : problem === 'size'
                    ? t(($) => $.logo.too_big)
                    : null}
              </FieldError>
            </Field>
            <Button
              type="submit"
              className="self-start"
              disabled={!file || problem !== null || upload.isPending}
            >
              {upload.isPending ? <Spinner /> : <UploadIcon />}
              {t(($) => $.logo.upload)}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
