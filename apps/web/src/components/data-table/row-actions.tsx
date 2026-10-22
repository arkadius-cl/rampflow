import { RowActionKind } from '@rampflow/shared/values';
import { EllipsisIcon, type LucideIcon } from 'lucide-react';
import { Fragment } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// The "…" menu at the end of a data table row (design system, "Row actions"): the standard
// actions (view, edit, duplicate) first, a separator, the other actions, a separator, the red
// ones last. The caller names the actions; the component derives the groups from their kind.

export interface RowAction {
  kind: RowActionKind;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
}

const GROUPS: readonly (readonly RowActionKind[])[] = [
  [RowActionKind.view, RowActionKind.edit, RowActionKind.duplicate],
  [RowActionKind.other],
  [RowActionKind.destructive],
];

/** `label` names the row ("Actions for Acme"). The wrapper carries `data-row-actions`. */
export function RowActions({ label, actions }: { label: string; actions: readonly RowAction[] }) {
  const groups = GROUPS.map((kinds) => actions.filter((a) => kinds.includes(a.kind))).filter(
    (group) => group.length > 0,
  );
  return (
    <div data-row-actions className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} />}>
          <EllipsisIcon aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {groups.map((group, i) => (
            <Fragment key={group[0]?.kind}>
              {i > 0 ? <DropdownMenuSeparator /> : null}
              {group.map((action) => {
                const Icon = action.icon;
                return (
                  <DropdownMenuItem
                    key={action.label}
                    variant={action.kind === RowActionKind.destructive ? 'destructive' : 'default'}
                    onClick={action.onSelect}
                  >
                    <Icon aria-hidden />
                    {action.label}
                  </DropdownMenuItem>
                );
              })}
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
