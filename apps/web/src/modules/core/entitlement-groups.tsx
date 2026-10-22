import { catalog, type ModuleId } from '@rampflow/shared';
import type { OpenModulesPrefKey } from '@rampflow/shared/modules/core/ui-prefs';
import { EntitlementKind } from '@rampflow/shared/values';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useUiPref } from '@/lib/access';
import { cn } from '@/lib/utils';
import { useEntitlementLabel } from './entitlements';

// PL-02: entitlement rows grouped by module, folded per group, the open groups stored per user.

interface EntitlementRow {
  key: string;
  module: ModuleId;
  kind: 'feature' | 'limit';
}

export interface ModuleGroup<R extends EntitlementRow> {
  module: ModuleId;
  rows: R[];
}

/** Every entitlement key's position in the catalog: modules in catalog order, keys as declared. */
const KEY_ORDER = new Map(
  catalog.flatMap((m) => Object.keys(m.entitlements)).map((key, i) => [key, i]),
);

/** Groups in catalog order, rows in the order their manifest declares them; no empty groups. */
export function groupByModule<R extends EntitlementRow>(rows: readonly R[]): ModuleGroup<R>[] {
  const groups = new Map<ModuleId, R[]>();
  const order = (row: R) => KEY_ORDER.get(row.key) ?? Number.POSITIVE_INFINITY;
  for (const row of rows.toSorted((a, b) => order(a) - order(b))) {
    const rowsOfModule = groups.get(row.module) ?? [];
    rowsOfModule.push(row);
    groups.set(row.module, rowsOfModule);
  }
  return [...groups].map(([module, rows]) => ({ module, rows }));
}

export interface ModuleGroupsState {
  isOpen: (module: ModuleId) => boolean;
  toggle: (module: ModuleId) => void;
  allOpen: boolean;
  toggleAll: () => void;
}

/** Which of `modules` are open, from the user's preference `prefKey`; none stored = all closed. */
export function useModuleGroups(
  prefKey: OpenModulesPrefKey,
  modules: readonly ModuleId[],
): ModuleGroupsState {
  const [stored, setOpen] = useUiPref(prefKey);
  const open = new Set(stored ?? []);
  const allOpen = modules.length > 0 && modules.every((m) => open.has(m));
  const save = (next: Set<ModuleId>) =>
    setOpen(catalog.map((m) => m.id).filter((id) => next.has(id)));
  return {
    isOpen: (module) => open.has(module),
    toggle: (module) => {
      const next = new Set(open);
      if (!next.delete(module)) next.add(module);
      save(next);
    },
    allOpen,
    toggleAll: () => save(allOpen ? new Set() : new Set([...open, ...modules])),
  };
}

/** "Expand all" while a group is closed, "Collapse all" once every group is open. */
export function ToggleAllGroups({ state }: { state: ModuleGroupsState }) {
  const { t } = useTranslation();
  return (
    <Button type="button" variant="outline" className="h-11" onClick={state.toggleAll}>
      {state.allOpen
        ? t(($) => $.platform.groups.collapse_all)
        : t(($) => $.platform.groups.expand_all)}
    </Button>
  );
}

export interface GroupColumn<R> {
  id: string;
  header: ReactNode;
  /** Applies to the header and every cell of the column; the default width is `w-40`. */
  className?: string;
  /** Whether a feature row is on in this column; a column without it shows no summary. */
  isOn?: (row: R) => boolean;
}

interface ModuleGroupTableProps<R extends EntitlementRow> {
  groups: readonly ModuleGroup<R>[];
  state: ModuleGroupsState;
  /** The first column: the entitlement, and the group header's toggle. */
  label: { header: ReactNode; className?: string };
  columns: readonly GroupColumn<R>[];
  /** The value cells of a row, one per column; the table renders the label cell. */
  renderCells: (row: R) => ReactNode;
}

export function ModuleGroupTable<R extends EntitlementRow>({
  groups,
  state,
  label,
  columns,
  renderCells,
}: ModuleGroupTableProps<R>) {
  const { t } = useTranslation();
  const entitlementLabel = useEntitlementLabel();
  const moduleName = (module: ModuleId) => t(`${module}:module.name` as never) as string;
  return (
    // Fixed column widths: expanding or collapsing a group must not move the columns. Below the
    // minimum width the table scrolls instead of squeezing the label column.
    <Table className="min-w-160 table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className={label.className}>{label.header}</TableHead>
          {columns.map((c) => (
            <TableHead key={c.id} className={cn('w-40', c.className)}>
              {c.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((group) => {
          const open = state.isOpen(group.module);
          const features = group.rows.filter((r) => r.kind === EntitlementKind.feature);
          const Chevron = open ? ChevronDownIcon : ChevronRightIcon;
          return (
            <Fragment key={group.module}>
              <TableRow data-testid={`module-group-${group.module}`}>
                <TableCell className={cn('py-0', label.className)}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => state.toggle(group.module)}
                    className="flex min-h-11 w-full items-center gap-2 rounded-md text-left font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <Chevron className="size-4 shrink-0" aria-hidden />
                    {t(($) => $.platform.groups.header, {
                      module: moduleName(group.module),
                      count: group.rows.length,
                    })}
                  </button>
                </TableCell>
                {columns.map((c) => {
                  const on = c.isOn ? features.filter(c.isOn).length : 0;
                  const show = !open && c.isOn && features.length > 0;
                  return (
                    <TableCell key={c.id} className={cn('tabular-nums', c.className)}>
                      {show ? (
                        <>
                          <span aria-hidden>
                            {on}/{features.length}
                          </span>
                          <span className="sr-only">
                            {t(($) => $.platform.groups.summary, { on, total: features.length })}
                          </span>
                        </>
                      ) : null}
                    </TableCell>
                  );
                })}
              </TableRow>
              {open
                ? group.rows.map((row) => (
                    <TableRow key={row.key} data-testid={`entitlement-${row.key}`}>
                      <TableCell className={label.className}>
                        {/* Indented by the chevron and its gap, under the module name. */}
                        <div className="pl-6">
                          <div className="font-medium">{entitlementLabel(row.key)}</div>
                          <code className="text-xs text-muted-foreground">{row.key}</code>
                        </div>
                      </TableCell>
                      {renderCells(row)}
                    </TableRow>
                  ))
                : null}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
