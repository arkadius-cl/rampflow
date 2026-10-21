import { SearchIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldLegend, FieldSet } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { useLocale } from '@/lib/i18n';
import { searchable } from '@/lib/search';

// The admitted-countries editor (PL-03): every option as a checkbox in named groups, each group
// with a select-all checkbox, and a filter. While filtering the group checkboxes are hidden, so no
// click changes an option the admin cannot see.

export interface ChecklistGroup {
  id: string;
  label: string;
  options: readonly string[];
}

export interface GroupedChecklistProps {
  id: string;
  /** The id of the element that names the whole list. */
  labelledBy: string;
  describedBy?: string;
  groups: readonly ChecklistGroup[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  /** An option's name in the UI language; the filter matches it and the option itself. */
  name: (option: string) => string;
  invalid?: boolean;
}

export function GroupedChecklist({
  id,
  labelledBy,
  describedBy,
  groups,
  value,
  onChange,
  name,
  invalid,
}: GroupedChecklistProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const countId = useId();
  const [query, setQuery] = useState('');
  const chosen = new Set(value);
  const all = groups.flatMap((g) => g.options);
  const needle = searchable(query.trim());
  const filtering = needle !== '';
  const matches = (o: string) =>
    !filtering || searchable(name(o)).includes(needle) || searchable(o) === needle;
  const byName = (a: string, b: string) => name(a).localeCompare(name(b), locale);
  // The stored list keeps the schema's option order, whatever order the clicks came in.
  const commit = (next: Set<string>) => onChange(all.filter((o) => next.has(o)));
  const toggle = (options: readonly string[], on: boolean) => {
    const next = new Set(chosen);
    for (const o of options) {
      if (on) next.add(o);
      else next.delete(o);
    }
    commit(next);
  };

  const visible = groups
    .map((g) => ({ ...g, shown: g.options.filter(matches).toSorted(byName) }))
    .filter((g) => g.shown.length > 0);

  return (
    <fieldset
      id={id}
      aria-labelledby={labelledBy}
      aria-describedby={[describedBy, countId].filter(Boolean).join(' ')}
      aria-invalid={invalid || undefined}
      className="flex flex-col gap-3"
    >
      <InputGroup className="max-w-sm">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          aria-label={t(($) => $['settings-ui'].countries.filter)}
          placeholder={t(($) => $['settings-ui'].countries.filter)}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </InputGroup>
      {visible.map((group) => {
        const picked = group.options.filter((o) => chosen.has(o)).length;
        return (
          <FieldSet key={group.id} className="gap-2">
            <FieldLegend variant="label" className="mb-1">
              {filtering ? (
                group.label
              ) : (
                <span className="flex items-center gap-2">
                  <Checkbox
                    id={`${id}-${group.id}`}
                    checked={picked === group.options.length}
                    indeterminate={picked > 0 && picked < group.options.length}
                    onCheckedChange={(on) => toggle(group.options, on)}
                  />
                  <label htmlFor={`${id}-${group.id}`}>{group.label}</label>
                </span>
              )}
            </FieldLegend>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-x-4 gap-y-1.5">
              {group.shown.map((o) => (
                <li key={o} className="flex min-h-6 items-center gap-2 text-sm">
                  <Checkbox
                    id={`${id}-${o}`}
                    checked={chosen.has(o)}
                    onCheckedChange={(on) => toggle([o], on)}
                  />
                  <label htmlFor={`${id}-${o}`}>{name(o)}</label>
                  <span aria-hidden className="text-xs text-muted-foreground">
                    {o}
                  </span>
                </li>
              ))}
            </ul>
          </FieldSet>
        );
      })}
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t(($) => $['settings-ui'].countries.no_match)}
        </p>
      ) : null}
      <p id={countId} aria-live="polite" className="text-sm text-muted-foreground">
        {t(($) => $['settings-ui'].countries.count, {
          selected: value.length,
          total: all.length,
        })}
      </p>
    </fieldset>
  );
}
