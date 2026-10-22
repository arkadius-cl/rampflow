import { zodResolver } from '@hookform/resolvers/zod';
import {
  NewTenantNote,
  type TenantNoteListQuery,
  type TenantNoteView,
} from '@rampflow/shared/modules/core/api.platform';
import { TenantNoteKind, TenantNoteSortKey } from '@rampflow/shared/modules/core/values';
import { BadgeSize, SheetSize, values } from '@rampflow/shared/values';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { applyServerIssues, useFieldMessage } from '@/components/app-shell/form-errors';
import { DataTable, type dataTableFeatures } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import type { ListControls } from '@/components/data-table/use-list-state';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
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
import { useFormat } from './format';
import { createTenantNote, platformKeys, tenantNotesQuery } from './queries';
import { TenantNoteKindBadge } from './tenant-status';

// PL-08: the Notes tab. An append-only Objektliste of the tenant's history (notes, suspensions,
// reactivations), newest first, and the "Add note" sheet above it. No row actions.

type NoteControls = ListControls<
  typeof TenantNoteListQuery.spec.sort,
  typeof TenantNoteListQuery.spec.facets
>;

const column = createColumnHelper<typeof dataTableFeatures, TenantNoteView>();

function useColumns() {
  const { t } = useTranslation();
  const format = useFormat();
  return useMemo(
    () =>
      column.columns([
        column.accessor(TenantNoteSortKey.createdAt, {
          header: ({ column: c }) => (
            <DataTableColumnHeader column={c} title={t(($) => $.platform.notes.time)} />
          ),
          cell: ({ row }) => (
            <span className="whitespace-nowrap tabular-nums">
              {format.instant(row.original.createdAt)}
            </span>
          ),
        }),
        column.display({
          id: 'kind',
          header: () => t(($) => $.platform.notes.kind),
          cell: ({ row }) => <TenantNoteKindBadge kind={row.original.kind} size={BadgeSize.sm} />,
        }),
        column.display({
          id: 'author',
          header: () => t(($) => $.platform.notes.author),
          cell: ({ row }) =>
            row.original.author ? (
              row.original.author.name
            ) : (
              <span className="text-muted-foreground">
                {t(($) => $.platform.notes.deleted_user)}
              </span>
            ),
        }),
        column.display({
          id: 'body',
          header: () => t(($) => $.platform.notes.body),
          cell: ({ row }) => (
            <span className="block max-w-xl whitespace-pre-wrap">{row.original.body}</span>
          ),
        }),
      ]),
    [t, format],
  );
}

export function TenantNotes({ tenantId, controls }: { tenantId: string; controls: NoteControls }) {
  const { t } = useTranslation();
  const notes = useQuery(tenantNotesQuery(tenantId, controls.state));
  const columns = useColumns();
  const [adding, setAdding] = useState(false);
  const add = (
    <Button size={BadgeSize.sm} onClick={() => setAdding(true)}>
      <PlusIcon /> {t(($) => $.platform.notes.add)}
    </Button>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">{add}</div>
      <DataTable
        controls={controls}
        query={notes}
        columns={columns}
        facets={{
          kind: {
            title: t(($) => $.platform.notes.kind),
            options: values(TenantNoteKind).map((kind) => ({
              value: kind,
              label: t(($) => $.platform.note_kind[kind]),
            })),
          },
        }}
        label={t(($) => $.platform.tenant.tabs.notes)}
        searchPlaceholder={t(($) => $.platform.notes.search)}
        getRowId={(note) => note.id}
        empty={
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t(($) => $.platform.notes.empty)}</EmptyTitle>
            </EmptyHeader>
            <EmptyContent>{add}</EmptyContent>
          </Empty>
        }
        noMatchTitle={t(($) => $.platform.notes.no_match)}
      />
      <Sheet open={adding} onOpenChange={setAdding}>
        <SheetContent size={SheetSize.sm}>
          {adding ? <AddNoteForm tenantId={tenantId} onClose={() => setAdding(false)} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AddNoteForm({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const message = useFieldMessage();
  const queryClient = useQueryClient();
  const form = useForm<NewTenantNote>({
    resolver: zodResolver(NewTenantNote),
    defaultValues: { body: '' },
  });
  const create = useMutation({
    mutationFn: (json: NewTenantNote) => createTenantNote(tenantId, json),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: platformKeys.tenantNotes(tenantId) });
      toast.success(t(($) => $.platform.notes.added));
      onClose();
    },
    onError: (e) => applyServerIssues(e, form.setError),
  });
  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={form.handleSubmit((v) => create.mutate(v))}
    >
      <SheetHeader>
        <SheetTitle>{t(($) => $.platform.notes.add)}</SheetTitle>
        <SheetDescription>{t(($) => $.platform.notes.add_description)}</SheetDescription>
      </SheetHeader>
      <div className="flex-1 overflow-auto px-pad py-4">
        <Controller
          name="body"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="note-body">{t(($) => $.platform.notes.body)}</FieldLabel>
              <Textarea
                {...field}
                id="note-body"
                rows={6}
                maxLength={2000}
                aria-invalid={fieldState.invalid}
              />
              <FieldError>{message(fieldState.error)}</FieldError>
            </Field>
          )}
        />
      </div>
      <SheetFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t(($) => $.platform.cancel)}
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? <Spinner /> : null}
          {t(($) => $.platform.notes.add)}
        </Button>
      </SheetFooter>
    </form>
  );
}
