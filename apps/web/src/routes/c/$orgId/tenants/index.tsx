import type { LinkedTenant } from '@rampflow/shared/modules/booking/api.carriers';
import { CarrierLinkStatus, RegistrationStatus } from '@rampflow/shared/modules/booking/values';
import { BadgeTone, Permission, UiSize } from '@rampflow/shared/values';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  CircleCheckIcon,
  CirclePauseIcon,
  HourglassIcon,
  PauseCircleIcon,
  WarehouseIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shells/page';
import { StatusBadge } from '@/components/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
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
import { carrierContextQuery, guard, useAccess } from '@/lib/access';
import { useDate } from '@/modules/carriers/format';
import { linkedTenantsQuery } from '@/modules/carriers/queries';
import { RegistrationStatusBadge } from '@/modules/carriers/status';

// CR-02, CR-05: /c/$orgId/tenants, the warehouses of this carrier with link and registration
// status. A registration waiting for approval shows as an alert (UX concept, carrier bookings).

export const Route = createFileRoute('/c/$orgId/tenants/')({
  beforeLoad: guard({ permission: Permission.booking.view }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(linkedTenantsQuery(params.orgId)),
  component: WarehousesPage,
});

function WarehousesPage() {
  const { t } = useTranslation('booking');
  const { orgId } = Route.useParams();
  const { data } = useSuspenseQuery(linkedTenantsQuery(orgId));
  // The context marks suspended warehouses (PL-07); the linked list carries no such flag.
  const context = useQuery(carrierContextQuery(orgId)).data;
  const suspended = new Set(context?.tenants.filter((x) => x.suspended).map((x) => x.id));
  const pending = data.items.filter(
    (tenant) => !tenant.link && tenant.registration?.status === RegistrationStatus.pending_approval,
  );
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t(($) => $.carriers.tenants.title)}
        description={`${t(($) => $.carriers.tenants.description)} ${t(($) => $.carriers.tenants.free)}`}
      />
      {pending.map((tenant) => (
        <Alert key={tenant.tenantId}>
          <HourglassIcon />
          <AlertTitle>{t(($) => $.carriers.tenants.pending_title)}</AlertTitle>
          <AlertDescription>
            {t(($) => $.carriers.tenants.pending, { name: tenant.name })}
          </AlertDescription>
        </Alert>
      ))}
      {data.items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WarehouseIcon />
            </EmptyMedia>
            <EmptyTitle>{t(($) => $.carriers.tenants.empty_title)}</EmptyTitle>
            <EmptyDescription>{t(($) => $.carriers.tenants.empty)}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="py-0">
          <CardContent className="overflow-x-auto px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">{t(($) => $.carriers.tenants.name)}</TableHead>
                  <TableHead>{t(($) => $.carriers.tenants.booking)}</TableHead>
                  <TableHead>{t(($) => $.carriers.tenants.registration)}</TableHead>
                  <TableHead className="pr-6 text-right">
                    <span className="sr-only">{t(($) => $.carriers.tenants.book)}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((tenant) => (
                  <WarehouseRow
                    key={tenant.tenantId}
                    orgId={orgId}
                    tenant={tenant}
                    suspended={suspended.has(tenant.tenantId)}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function WarehouseRow({
  orgId,
  tenant,
  suspended,
}: {
  orgId: string;
  tenant: LinkedTenant;
  suspended: boolean;
}) {
  const { t } = useTranslation('booking');
  const { can } = useAccess();
  const date = useDate();
  const { link, registration } = tenant;
  return (
    <TableRow>
      <TableCell className="pl-6 font-medium">
        <span className="inline-flex items-center gap-2">
          {tenant.name}
          {suspended ? (
            <StatusBadge
              size={UiSize.sm}
              meta={{
                icon: CirclePauseIcon,
                tone: BadgeTone.neutral,
                label: t(($) => $.portal.unavailable),
              }}
            />
          ) : null}
        </span>
      </TableCell>
      <TableCell>
        {link ? (
          <div className="flex flex-col gap-1">
            <StatusBadge
              meta={
                link.status === CarrierLinkStatus.active
                  ? {
                      icon: CircleCheckIcon,
                      tone: BadgeTone.success,
                      label: t(($) => $.carriers.tenants.can_book),
                    }
                  : {
                      icon: PauseCircleIcon,
                      tone: BadgeTone.neutral,
                      label: t(($) => $.carriers.tenants.paused),
                    }
              }
            />
            <span className="text-xs text-muted-foreground">
              {t(($) => $.carriers.tenants.since)} {date(link.since)}
            </span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">
            {t(($) => $.carriers.tenants.not_linked)}
          </span>
        )}
      </TableCell>
      <TableCell>
        {registration ? (
          <div className="flex flex-col gap-1">
            <RegistrationStatusBadge status={registration.status} />
            {registration.rejectReason ? (
              <span className="max-w-72 text-xs text-muted-foreground">
                {t(($) => $.carriers.tenants.rejected_reason, {
                  reason: registration.rejectReason,
                })}
              </span>
            ) : null}
          </div>
        ) : null}
      </TableCell>
      <TableCell className="pr-6 text-right">
        {link?.status === CarrierLinkStatus.active && !suspended && can(Permission.booking.book) ? (
          <a
            href={`/c/${orgId}/book?tenant=${tenant.tenantId}`}
            className={buttonVariants({ size: 'sm', variant: 'outline' })}
          >
            {t(($) => $.carriers.tenants.book)}
          </a>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
