import type { SettingSource } from '@rampflow/shared/contract/settings';
import {
  Building2Icon,
  CodeIcon,
  GlobeIcon,
  type LucideIcon,
  MapPinIcon,
  RotateCcwIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const SETTING_SOURCE_ICON: Record<SettingSource, LucideIcon> = {
  default: CodeIcon,
  platform: GlobeIcon,
  tenant: Building2Icon,
  site: MapPinIcon,
};

export function SourceBadge({
  source,
  overridden,
  className,
}: {
  source: SettingSource;
  /** True when the source is the scope currently being edited. */
  overridden: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const Icon = SETTING_SOURCE_ICON[source];
  const label = t(($) => $['settings-ui'].source[source]);
  return (
    <span
      data-testid="setting-source"
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium',
        overridden
          ? 'border-tone-planned-border bg-tone-planned-bg text-tone-planned'
          : 'border-border bg-muted text-muted-foreground',
        className,
      )}
    >
      <Icon className="size-3" />
      {overridden
        ? t(($) => $['settings-ui'].set_here, { source: label })
        : t(($) => $['settings-ui'].inherited_from, { source: label })}
    </span>
  );
}

export interface SettingFieldProps {
  id: string;
  label: string;
  description: string;
  source: SettingSource;
  /** The scope this page edits. A value whose source equals it is an override. */
  scope: SettingSource;
  /** What the value would become after "Reset to inherited". */
  inheritedValue?: string;
  onReset?: () => void;
  resetting?: boolean;
  control: React.ReactNode;
}

/** One settings row: label and help on the left, control plus provenance on the right (TN-02). */
export function SettingField({
  id,
  label,
  description,
  source,
  scope,
  inheritedValue,
  onReset,
  resetting,
  control,
}: SettingFieldProps) {
  const { t } = useTranslation();
  const overridden = source === scope;
  return (
    <div
      data-testid={`setting-${id}`}
      className={cn(
        'grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]',
        overridden && 'border-l-2 border-l-tone-planned pl-3 md:-ml-3',
      )}
    >
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        <code className="mt-1 block text-[11px] text-muted-foreground">{id}</code>
      </div>
      <div className="flex flex-col gap-1.5">
        {control}
        <div className="flex min-h-6 flex-wrap items-center justify-between gap-2">
          <SourceBadge source={source} overridden={overridden} />
          {overridden ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={onReset}
              disabled={resetting}
              className="text-muted-foreground"
            >
              <RotateCcwIcon />
              {inheritedValue
                ? t(($) => $['settings-ui'].reset_to, { value: inheritedValue })
                : t(($) => $['settings-ui'].reset)}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
