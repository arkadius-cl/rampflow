import type {
  CarrierInvitationView,
  CarrierLinkStatus,
  CarrierLinkView,
} from '@rampflow/shared/modules/booking/api.carriers';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { TruckIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, call } from '@/lib/api';
import { useCountryName, useDate } from './format';
import { carrierKeys, networkQuery } from './queries';
import { LinkStatusBadge } from './status';

/** TN-03: linked carriers with their status, and the invitations still pending. */
export function LinkedTab({ orgId }: { orgId: string }) {
  const { t } = useTranslation('booking');
  const { data } = useSuspenseQuery(networkQuery(orgId));
  return (
    <div className="flex flex-col gap-4">
      {data.links.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TruckIcon />
            </EmptyMedia>
            <EmptyTitle>{t(($) => $.carriers.linked.empty_title)}</EmptyTitle>
            <EmptyDescription>{t(($) => $.carriers.linked.empty)}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <LinksTable orgId={orgId} links={data.links} />
      )}
      {data.invitations.length > 0 ? (
        <PendingInvitations orgId={orgId} invitations={data.invitations} />
      ) : null}
    </div>
  );
}

function LinksTable({ orgId, links }: { orgId: string; links: CarrierLinkView[] }) {
  const { t } = useTranslation('booking');
  const date = useDate();
  const country = useCountryName();
  return (
    <Card className="py-0">
      <CardContent className="overflow-x-auto px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">{t(($) => $.carriers.linked.carrier)}</TableHead>
              <TableHead>{t(($) => $.carriers.linked.country)}</TableHead>
              <TableHead>{t(($) => $.carriers.linked.source)}</TableHead>
              <TableHead>{t(($) => $.carriers.linked.since)}</TableHead>
              <TableHead>{t(($) => $.carriers.linked.status)}</TableHead>
              <TableHead className="pr-6 text-right">
                {t(($) => $.carriers.linked.actions)}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {links.map((link) => (
              <TableRow key={link.carrierId}>
                <TableCell className="pl-6 font-medium">{link.name}</TableCell>
                <TableCell>{country(link.country)}</TableCell>
                <TableCell>{t(($) => $.carriers.source[link.source])}</TableCell>
                <TableCell>{date(link.linkedAt)}</TableCell>
                <TableCell>
                  <LinkStatusBadge status={link.status} />
                </TableCell>
                <TableCell className="pr-6 text-right">
                  <LinkAction orgId={orgId} link={link} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function LinkAction({ orgId, link }: { orgId: string; link: CarrierLinkView }) {
  const { t } = useTranslation('booking');
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: (status: CarrierLinkStatus) =>
      call<CarrierLinkView>(
        api.t[':orgId'].carriers[':carrierId'].$patch({
          param: { orgId, carrierId: link.carrierId },
          json: { status },
        }),
      ),
    onSuccess: async (updated) => {
      toast.success(
        updated.status === 'active'
          ? t(($) => $.carriers.linked.activated, { name: updated.name })
          : t(($) => $.carriers.linked.deactivated, { name: updated.name }),
      );
      await queryClient.invalidateQueries({ queryKey: carrierKeys.all(orgId) });
    },
  });
  if (link.status === 'deactivated') {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={change.isPending}
        onClick={() => change.mutate('active')}
      >
        {t(($) => $.carriers.linked.activate)}
      </Button>
    );
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
        {t(($) => $.carriers.linked.deactivate)}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(($) => $.carriers.linked.deactivate_title, { name: link.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(($) => $.carriers.linked.deactivate_description, { name: link.name })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t(($) => $.carriers.linked.cancel)}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => change.mutate('deactivated')}>
            {t(($) => $.carriers.linked.deactivate)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PendingInvitations({
  orgId,
  invitations,
}: {
  orgId: string;
  invitations: CarrierInvitationView[];
}) {
  const { t } = useTranslation('booking');
  const date = useDate();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: carrierKeys.all(orgId) });
  const revoke = useMutation({
    mutationFn: (inv: CarrierInvitationView) =>
      call(
        api.t[':orgId'].carriers.invitations[':invitationId'].$delete({
          param: { orgId, invitationId: inv.id },
        }),
      ),
    onSuccess: async (_, inv) => {
      toast.success(t(($) => $.carriers.invitations.revoked, { email: inv.email }));
      await refresh();
    },
  });
  const resend = useMutation({
    mutationFn: (inv: CarrierInvitationView) =>
      call<CarrierInvitationView>(
        api.t[':orgId'].carriers.invitations.$post({
          param: { orgId },
          json: { companyName: inv.companyName, email: inv.email },
        }),
      ),
    onSuccess: async (sent) => {
      toast.success(t(($) => $.carriers.invitations.resent, { email: sent.email }));
      await refresh();
    },
  });
  const now = Date.now();
  return (
    <Card className="gap-0 pb-0">
      <CardHeader>
        <CardTitle>
          <h2 className="text-base font-semibold">{t(($) => $.carriers.invitations.title)}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">{t(($) => $.carriers.invitations.company)}</TableHead>
              <TableHead>{t(($) => $.carriers.invitations.email)}</TableHead>
              <TableHead>{t(($) => $.carriers.invitations.expires)}</TableHead>
              <TableHead className="pr-6 text-right">
                <span className="sr-only">{t(($) => $.carriers.linked.actions)}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="pl-6 font-medium">{inv.companyName}</TableCell>
                <TableCell>{inv.email}</TableCell>
                <TableCell>
                  {Date.parse(inv.expiresAt) < now
                    ? t(($) => $.carriers.invitations.expired)
                    : date(inv.expiresAt)}
                </TableCell>
                <TableCell className="pr-6 text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={resend.isPending}
                      onClick={() => resend.mutate(inv)}
                    >
                      {t(($) => $.carriers.invitations.resend)}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate(inv)}
                    >
                      {t(($) => $.carriers.invitations.revoke)}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
