import { PlusCircleIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';

/** Up to this many selected values show by name on the trigger, more as a count. */
const MAX_NAMED = 2;

export interface FacetOption {
  value: string;
  label: string;
}

/** One facet: a popover of values with their counts, the selection named on the trigger. */
export function DataTableFacetedFilter({
  title,
  options,
  selected,
  counts,
  onChange,
}: {
  title: string;
  options: readonly FacetOption[];
  selected: readonly string[];
  counts: Readonly<Record<string, number>> | undefined;
  onChange: (selected: string[]) => void;
}) {
  const { t } = useTranslation();
  const chosen = options.filter((o) => selected.includes(o.value));
  const toggle = (value: string) =>
    onChange(
      options
        .map((o) => o.value)
        .filter((v) => (v === value ? !selected.includes(v) : selected.includes(v))),
    );
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" className="border-dashed" />}>
        <PlusCircleIcon aria-hidden />
        {title}
        {chosen.length > 0 ? (
          <>
            <Separator orientation="vertical" className="mx-1 h-4" />
            {chosen.length > MAX_NAMED ? (
              <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                {t(($) => $['data-table'].selected, { count: chosen.length })}
              </Badge>
            ) : (
              chosen.map((o) => (
                <Badge key={o.value} variant="secondary" className="rounded-sm px-1 font-normal">
                  {o.label}
                </Badge>
              ))
            )}
          </>
        ) : null}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder={title} aria-label={title} />
          <CommandList>
            <CommandEmpty>{t(($) => $['data-table'].no_values)}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  data-checked={selected.includes(o.value)}
                  aria-checked={selected.includes(o.value)}
                  onSelect={() => toggle(o.value)}
                >
                  <span className="flex-1">{o.label}</span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {counts?.[o.value] ?? 0}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
