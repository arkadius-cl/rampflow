import type { PublicLinkView } from '@rampflow/shared/modules/booking/api.carriers';
import { BadgeTone, Permission } from '@rampflow/shared/values';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import {
  CopyIcon,
  InfoIcon,
  LinkIcon,
  MapPinIcon,
  ToggleLeftIcon,
  ToggleRightIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/status-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { useAccess } from '@/lib/access';
import { api, call } from '@/lib/api';
import { carrierKeys, publicLinksQuery, publicLinkUrl } from './queries';

/**
 * TN-04: one public link per site. The slug is created and replaced here; whether it answers
 * and how new carriers are approved are site settings (`booking.public_link_enabled`,
 * `booking.public_registration_mode`), edited on the settings screen.
 */
export function LinksTab({ orgId }: { orgId: string }) {
  const { t } = useTranslation('booking');
  const { can } = useAccess();
  const { data } = useSuspenseQuery(publicLinksQuery(orgId));
  if (data.items.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MapPinIcon />
          </EmptyMedia>
          <EmptyTitle>{t(($) => $.carriers.links.empty_title)}</EmptyTitle>
          <EmptyDescription>{t(($) => $.carriers.links.empty)}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <InfoIcon />
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>{t(($) => $.carriers.links.hint)}</span>
          {can(Permission.core.manage_settings) ? (
            <a
              href={`/t/${orgId}/settings`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              {t(($) => $.carriers.links.settings)}
            </a>
          ) : null}
        </AlertDescription>
      </Alert>
      <Card className="py-0">
        <CardContent className="overflow-x-auto px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">{t(($) => $.carriers.links.site)}</TableHead>
                <TableHead>{t(($) => $.carriers.links.state)}</TableHead>
                <TableHead>{t(($) => $.carriers.links.mode)}</TableHead>
                <TableHead className="pr-6">{t(($) => $.carriers.links.link)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((link) => (
                <LinkRow key={link.siteId} orgId={orgId} link={link} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function LinkRow({ orgId, link }: { orgId: string; link: PublicLinkView }) {
  const { t } = useTranslation('booking');
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: carrierKeys.publicLinks(orgId) });
  const create = useMutation({
    mutationFn: () =>
      call<PublicLinkView>(
        api.t[':orgId'].carriers['public-links'].$post({
          param: { orgId },
          json: { siteId: link.siteId },
        }),
      ),
    onSuccess: refresh,
  });
  const regenerate = useMutation({
    mutationFn: () =>
      call<PublicLinkView>(
        api.t[':orgId'].carriers['public-links'][':siteId'].regenerate.$post({
          param: { orgId, siteId: link.siteId },
        }),
      ),
    onSuccess: async () => {
      setConfirming(false);
      await refresh();
    },
  });
  const url = link.slug ? publicLinkUrl(link.slug) : null;
  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast.success(t(($) => $.carriers.links.copied));
  };
  return (
    <TableRow>
      <TableCell className="pl-6 font-medium">{link.siteName}</TableCell>
      <TableCell>
        <StatusBadge
          meta={
            link.enabled
              ? {
                  icon: ToggleRightIcon,
                  tone: BadgeTone.success,
                  label: t(($) => $.carriers.links.on),
                }
              : {
                  icon: ToggleLeftIcon,
                  tone: BadgeTone.neutral,
                  label: t(($) => $.carriers.links.off),
                }
          }
        />
      </TableCell>
      <TableCell>{t(($) => $.carriers.links.modes[link.mode])}</TableCell>
      <TableCell className="pr-6">
        {url ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs" data-testid="public-link">
              {url}
            </code>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t(($) => $.carriers.links.copy, { site: link.siteName })}
              onClick={copy}
            >
              <CopyIcon />
            </Button>
            <AlertDialog open={confirming} onOpenChange={setConfirming}>
              <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
                {t(($) => $.carriers.links.regenerate)}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t(($) => $.carriers.links.regenerate_title, { site: link.siteName })}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t(($) => $.carriers.links.regenerate_description)}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t(($) => $.carriers.links.cancel)}</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={regenerate.isPending}
                    onClick={() => regenerate.mutate()}
                  >
                    {t(($) => $.carriers.links.regenerate)}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t(($) => $.carriers.links.none)}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={create.isPending}
              onClick={() => create.mutate()}
            >
              <LinkIcon />
              {t(($) => $.carriers.links.create)}
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
