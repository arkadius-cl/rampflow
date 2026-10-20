import type { FacetSets, ValueSet } from '@rampflow/shared/contract/list';
import { SearchIcon, XIcon } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { DataTableFacetedFilter, type FacetOption } from './data-table-faceted-filter';
import type { ListControls } from './use-list-state';

export interface FacetConfig {
  title: string;
  options: readonly FacetOption[];
}

/** The filter of each facet, keyed like the list's facets. */
export type FacetConfigs<F extends FacetSets> = { readonly [K in keyof F]: FacetConfig };

export const facetEntries = <F extends FacetSets>(facets: FacetConfigs<F>) =>
  Object.entries(facets) as [keyof F & string, FacetConfig][];

/** Search, one filter per facet, "Clear filters" while any is set, a spinner while fetching. */
export function DataTableToolbar<S extends ValueSet, F extends FacetSets>({
  controls,
  facets,
  facetCounts,
  searchPlaceholder,
  fetching,
}: {
  controls: ListControls<S, F>;
  facets: FacetConfigs<F>;
  facetCounts: Readonly<Record<string, Readonly<Record<string, number>>>> | undefined;
  searchPlaceholder: string;
  fetching: boolean;
}) {
  const { t } = useTranslation();
  const searchId = useId();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Label htmlFor={searchId} className="sr-only">
        {t(($) => $['data-table'].search)}
      </Label>
      <InputGroup className="h-8 w-72">
        <InputGroupAddon>
          <SearchIcon aria-hidden />
        </InputGroupAddon>
        <InputGroupInput
          id={searchId}
          type="search"
          maxLength={100}
          placeholder={searchPlaceholder}
          value={controls.draft}
          onChange={(e) => controls.setDraft(e.target.value)}
          onBlur={controls.endTyping}
        />
      </InputGroup>
      {facetEntries(facets).map(([name, facet]) => (
        <DataTableFacetedFilter
          key={name}
          title={facet.title}
          options={facet.options}
          selected={controls.state[name] as readonly string[]}
          counts={facetCounts?.[name]}
          onChange={(selected) => controls.setFacet(name, selected)}
        />
      ))}
      {controls.filtered ? (
        <Button variant="ghost" size="sm" onClick={controls.clear}>
          {t(($) => $['data-table'].clear)}
          <XIcon aria-hidden />
        </Button>
      ) : null}
      {fetching ? <Spinner aria-label={t(($) => $['data-table'].loading)} /> : null}
    </div>
  );
}
