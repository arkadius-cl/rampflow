import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useFormat } from './format';

/**
 * An instant as a relative time ("3 days ago") in a `time` element, with the exact instant and
 * zone in a tooltip that opens on hover and on focus. `empty` shows when there is no instant.
 */
export function RelativeTime({ iso, empty }: { iso: string | null; empty: string }) {
  const format = useFormat();
  if (iso === null) return <span className="text-muted-foreground">{empty}</span>;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="cursor-default rounded-sm whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
        }
      >
        <time dateTime={iso}>{format.relative(iso)}</time>
      </TooltipTrigger>
      <TooltipContent>{format.instant(iso)}</TooltipContent>
    </Tooltip>
  );
}
