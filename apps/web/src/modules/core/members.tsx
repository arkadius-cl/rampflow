import { zodResolver } from '@hookform/resolvers/zod';
import type { ContextSite } from '@rampflow/shared/modules/core/api.context';
import {
  type InvitationView,
  isSiteLimited,
  type MemberList,
  type MemberView,
} from '@rampflow/shared/modules/core/api.staff';
import { useMutation } from '@tanstack/react-query';
import {
  MailPlusIcon,
  PencilIcon,
  TrashIcon,
  TriangleAlertIcon,
  UserMinusIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type * as z from 'zod';
import { applyServerIssues, useFieldMessage } from '@/components/app-shell/form-errors';
import { PageHeader } from '@/components/shells/page';
import { Badge } from '@/components/ui/badge';
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmButton } from './confirm-button';
import { useFormat } from './format';

// Members and pending invitations of one org: tenant staff (TN-01) and carrier colleagues
// (CR-04). Only staff have sites, and only gate and dock operators are limited to some.

export interface MemberForm<R extends string = string> {
  email: string;
  role: R;
  siteIds: string[];
}

export interface MembersAdmin<R extends string> {
  roles: readonly R[];
  /** The tenant's sites; absent for carriers. */
  sites?: ContextSite[];
  list: MemberList<R> | undefined;
  inviteSchema: z.ZodType<unknown>;
  updateSchema: z.ZodType<unknown>;
  invite: (body: MemberForm<R>) => Promise<unknown>;
  update: (membershipId: string, body: Omit<MemberForm<R>, 'email'>) => Promise<unknown>;
  remove: (membershipId: string) => Promise<unknown>;
  revoke: (invitationId: string) => Promise<unknown>;
}

export function MembersScreen<R extends string>({
  title,
  description,
  admin,
}: {
  title: string;
  description: string;
  admin: MembersAdmin<R>;
}) {
  const { t } = useTranslation();
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<MemberView<R> | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          <Button size="sm" onClick={() => setInviting(true)}>
            <MailPlusIcon /> {t(($) => $.staff.invite)}
          </Button>
        }
      />
      {admin.list ? (
        <>
          <MembersTable admin={admin} members={admin.list.members} onEdit={setEditing} />
          <InvitationsTable admin={admin} invitations={admin.list.invitations} />
        </>
      ) : (
        <Skeleton className="h-48" />
      )}
      <MemberDialog
        key={inviting ? 'invite' : (editing?.membershipId ?? 'closed')}
        admin={admin}
        open={inviting || editing !== null}
        member={editing}
        onClose={() => {
          setInviting(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function useRoleLabel() {
  const { t } = useTranslation();
  return (role: string) => t(`shell.roles.${role}` as never) as string;
}

function useSiteNames(sites: ContextSite[] | undefined) {
  const { t } = useTranslation();
  return (role: string, siteIds: string[]) => {
    if (!isSiteLimited(role) || siteIds.length === 0) return t(($) => $.staff.all_sites);
    return siteIds.map((id) => sites?.find((s) => s.id === id)?.name ?? id).join(', ');
  };
}

function MembersTable<R extends string>({
  admin,
  members,
  onEdit,
}: {
  admin: MembersAdmin<R>;
  members: MemberView<R>[];
  onEdit: (member: MemberView<R>) => void;
}) {
  const { t } = useTranslation();
  const siteNames = useSiteNames(admin.sites);
  const roleLabel = useRoleLabel();
  return (
    <section aria-labelledby="members-title" className="flex flex-col gap-2">
      <h2 id="members-title" className="font-semibold">
        {t(($) => $.staff.members)}
      </h2>
      <div className="overflow-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t(($) => $.staff.columns.name)}</TableHead>
              <TableHead>{t(($) => $.staff.columns.email)}</TableHead>
              <TableHead>{t(($) => $.staff.columns.role)}</TableHead>
              {admin.sites ? <TableHead>{t(($) => $.staff.columns.sites)}</TableHead> : null}
              <TableHead>
                <span className="sr-only">{t(($) => $.staff.columns.actions)}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.membershipId}>
                <TableCell className="font-medium">
                  {m.name}
                  {m.self ? (
                    <Badge variant="secondary" className="ml-2">
                      {t(($) => $.staff.you)}
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell>{m.email}</TableCell>
                <TableCell>{roleLabel(m.role)}</TableCell>
                {admin.sites ? <TableCell>{siteNames(m.role, m.siteIds)}</TableCell> : null}
                <TableCell className="text-right whitespace-nowrap">
                  {m.self ? null : (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t(($) => $.staff.edit_member, { name: m.name })}
                        onClick={() => onEdit(m)}
                      >
                        <PencilIcon />
                      </Button>
                      <ConfirmButton
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t(($) => $.staff.remove_member, { name: m.name })}
                          >
                            <UserMinusIcon />
                          </Button>
                        }
                        title={t(($) => $.staff.remove_title, { name: m.name })}
                        description={t(($) => $.staff.remove_description)}
                        confirm={t(($) => $.staff.remove)}
                        onConfirm={async () => {
                          await admin.remove(m.membershipId);
                          toast.success(t(($) => $.staff.removed, { name: m.name }));
                        }}
                      />
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function InvitationsTable<R extends string>({
  admin,
  invitations,
}: {
  admin: MembersAdmin<R>;
  invitations: InvitationView<R>[];
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const siteNames = useSiteNames(admin.sites);
  const roleLabel = useRoleLabel();
  const revoke = useMutation({
    mutationFn: (i: InvitationView<R>) => admin.revoke(i.id),
    onSuccess: (_, i) => toast.success(t(($) => $.staff.revoked, { email: i.email })),
  });
  return (
    <section aria-labelledby="invitations-title" className="flex flex-col gap-2">
      <h2 id="invitations-title" className="font-semibold">
        {t(($) => $.staff.invitations)}
      </h2>
      {invitations.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t(($) => $.staff.no_invitations)}</p>
      ) : (
        <div className="overflow-auto rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(($) => $.staff.columns.email)}</TableHead>
                <TableHead>{t(($) => $.staff.columns.role)}</TableHead>
                {admin.sites ? <TableHead>{t(($) => $.staff.columns.sites)}</TableHead> : null}
                <TableHead>{t(($) => $.staff.columns.expires)}</TableHead>
                <TableHead>
                  <span className="sr-only">{t(($) => $.staff.columns.actions)}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.email}</TableCell>
                  <TableCell>{roleLabel(i.role)}</TableCell>
                  {admin.sites ? <TableCell>{siteNames(i.role, i.siteIds)}</TableCell> : null}
                  <TableCell className="tabular-nums">
                    {i.expired ? (
                      <Badge variant="outline" className="mr-2">
                        <TriangleAlertIcon /> {t(($) => $.staff.expired)}
                      </Badge>
                    ) : null}
                    {format.instant(i.expiresAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={revoke.isPending}
                      aria-label={t(($) => $.staff.revoke_for, { email: i.email })}
                      onClick={() => revoke.mutate(i)}
                    >
                      <TrashIcon /> {t(($) => $.staff.revoke)}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

/** Invites a new member, or edits the role and sites of `member`. */
function MemberDialog<R extends string>({
  admin,
  open,
  member,
  onClose,
}: {
  admin: MembersAdmin<R>;
  open: boolean;
  member: MemberView<R> | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const message = useFieldMessage();
  const roleLabel = useRoleLabel();
  const editing = member !== null;
  const form = useForm<MemberForm>({
    resolver: zodResolver((editing ? admin.updateSchema : admin.inviteSchema) as never),
    defaultValues: {
      email: member?.email ?? '',
      role: member?.role ?? (admin.roles.at(-1) as R),
      siteIds: member?.siteIds ?? [],
    },
  });
  const save = useMutation({
    mutationFn: ({ email, role, siteIds }: MemberForm) => {
      const body = { role: role as R, siteIds: admin.sites && isSiteLimited(role) ? siteIds : [] };
      return member ? admin.update(member.membershipId, body) : admin.invite({ email, ...body });
    },
    onSuccess: (_, v) => {
      toast.success(
        member
          ? t(($) => $.staff.updated, { name: member.name })
          : t(($) => $.staff.invited, { email: v.email }),
      );
      onClose();
    },
    onError: (e) => applyServerIssues(e, form.setError),
  });
  const role = form.watch('role');
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <form noValidate onSubmit={form.handleSubmit((v) => save.mutate(v))}>
          <DialogHeader className="mb-4">
            <DialogTitle>
              {member
                ? t(($) => $.staff.edit_title, { name: member.name })
                : t(($) => $.staff.invite_title)}
            </DialogTitle>
            <DialogDescription>
              {member ? member.email : t(($) => $.staff.invite_description)}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {member ? null : (
              <Controller
                name="email"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="member-email">{t(($) => $.staff.email)}</FieldLabel>
                    <Input
                      {...field}
                      id="member-email"
                      type="email"
                      autoComplete="off"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError>{message(fieldState.error, 'email')}</FieldError>
                  </Field>
                )}
              />
            )}
            <Controller
              name="role"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="member-role">{t(($) => $.staff.role)}</FieldLabel>
                  <NativeSelect
                    id="member-role"
                    className="w-full"
                    value={field.value}
                    onChange={(e) => {
                      field.onChange(e.target.value);
                      if (!isSiteLimited(e.target.value)) form.setValue('siteIds', []);
                    }}
                  >
                    {admin.roles.map((r) => (
                      <NativeSelectOption key={r} value={r}>
                        {roleLabel(r)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <FieldError>{message(fieldState.error)}</FieldError>
                </Field>
              )}
            />
            {admin.sites && isSiteLimited(role) ? (
              <Controller
                name="siteIds"
                control={form.control}
                render={({ field, fieldState }) => (
                  <FieldSet data-invalid={fieldState.invalid}>
                    <FieldLegend variant="label">{t(($) => $.staff.sites)}</FieldLegend>
                    <FieldDescription>{t(($) => $.staff.sites_hint)}</FieldDescription>
                    <div className="flex flex-col gap-2">
                      {admin.sites?.map((s) => (
                        <Field key={s.id} orientation="horizontal">
                          <Checkbox
                            id={`member-site-${s.id}`}
                            checked={field.value.includes(s.id)}
                            onCheckedChange={(on) =>
                              field.onChange(
                                on
                                  ? [...field.value, s.id]
                                  : field.value.filter((id) => id !== s.id),
                              )
                            }
                          />
                          <FieldLabel htmlFor={`member-site-${s.id}`} className="font-normal">
                            {s.name}
                          </FieldLabel>
                        </Field>
                      ))}
                    </div>
                    <FieldError>{message(fieldState.error)}</FieldError>
                  </FieldSet>
                )}
              />
            ) : null}
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              {t(($) => $.staff.cancel)}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Spinner /> : null}
              {member ? t(($) => $.staff.save) : t(($) => $.staff.send_invitation)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
