import type { BoardView, BookingSummary } from '@rampflow/shared/modules/booking/api.staff';
import { useTranslation } from 'react-i18next';
import { SiteTime } from '@/components/site-time';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useSiteTime } from '@/lib/time';
import { BookingFlagBadge, BookingStatusBadge, flagsOf } from './display';

// BK-01: the list view, the board's data as a table for keyboard and screen-reader users.

export function BookingList({
  items,
  board,
  caption,
  selectedId,
  onSelect,
  hasMore,
  loadingMore,
  onMore,
}: {
  items: BookingSummary[];
  board: BoardView | undefined;
  caption: string;
  selectedId?: string;
  onSelect: (bookingId: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
}) {
  const { t } = useTranslation('booking');
  const siteTime = useSiteTime();
  const resourceName = (id: string) => board?.resources.find((r) => r.id === id)?.name ?? '';
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="overflow-auto rounded-lg border bg-background">
        <Table>
          <TableCaption className="sr-only">{caption}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">{t(($) => $.plan.list.slot)}</TableHead>
              <TableHead>{t(($) => $.plan.list.carrier)}</TableHead>
              <TableHead>{t(($) => $.plan.list.code)}</TableHead>
              <TableHead>{t(($) => $.plan.list.resource)}</TableHead>
              <TableHead className="text-right">{t(($) => $.plan.list.units)}</TableHead>
              <TableHead>{t(($) => $.plan.list.status)}</TableHead>
              <TableHead className="pr-4">{t(($) => $.plan.list.flags)}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((b) => (
              <TableRow key={b.id} data-state={b.id === selectedId ? 'selected' : undefined}>
                <TableCell className="pl-4 whitespace-nowrap">
                  <SiteTime {...siteTime(b.startsAt, b.timeZone)} />
                  <span aria-hidden> – </span>
                  <span className="sr-only">{t(($) => $.plan.detail.to)}</span>
                  <SiteTime {...siteTime(b.endsAt, b.timeZone)} viewerTime={undefined} />
                </TableCell>
                <TableCell>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto px-0 font-medium"
                    aria-pressed={b.id === selectedId}
                    onClick={() => onSelect(b.id)}
                  >
                    {b.carrierName}
                  </Button>
                </TableCell>
                <TableCell className="font-mono text-xs">{b.code}</TableCell>
                <TableCell>{resourceName(b.resourceId)}</TableCell>
                <TableCell className="text-right tabular-nums">{b.loadUnits}</TableCell>
                <TableCell>
                  <BookingStatusBadge status={b.status} size="sm" />
                </TableCell>
                <TableCell className="pr-4">
                  <span className="flex flex-wrap gap-1">
                    {flagsOf(b).map((f) => (
                      <BookingFlagBadge key={f} flag={f} size="sm" />
                    ))}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {hasMore ? (
        <Button
          variant="outline"
          className="w-fit self-center"
          disabled={loadingMore}
          onClick={onMore}
        >
          {loadingMore ? <Spinner /> : null}
          {t(($) => $.plan.list.more)}
        </Button>
      ) : null}
    </div>
  );
}
