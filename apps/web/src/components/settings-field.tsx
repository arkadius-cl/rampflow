import {
  Building2Icon,
  CodeIcon,
  GlobeIcon,
  type LucideIcon,
  MapPinIcon,
  RotateCcwIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SettingSource } from '@/lib/domain';
import { cn } from '@/lib/utils';

export const SETTING_SOURCE: Record<SettingSource, { label: string; icon: LucideIcon }> = {
  default: { label: 'Default', icon: CodeIcon },
  platform: { label: 'Platform', icon: GlobeIcon },
  tenant: { label: 'Tenant', icon: Building2Icon },
  site: { label: 'Site', icon: MapPinIcon },
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
  const meta = SETTING_SOURCE[source];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium',
        overridden
          ? 'border-tone-planned-border bg-tone-planned-bg text-tone-planned'
          : 'border-border bg-muted text-muted-foreground',
        className,
      )}
    >
      <Icon className="size-3" />
      {overridden ? `Set here (${meta.label})` : `Inherited from ${meta.label}`}
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
  control,
}: SettingFieldProps) {
  const overridden = source === scope;
  return (
    <div
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
        <code className="mt-1 block text-[11px] text-muted-foreground/70">{id}</code>
      </div>
      <div className="flex flex-col gap-1.5">
        {control}
        <div className="flex min-h-6 items-center justify-between gap-2">
          <SourceBadge source={source} overridden={overridden} />
          {overridden ? (
            <Button variant="ghost" size="xs" onClick={onReset} className="text-muted-foreground">
              <RotateCcwIcon />
              Reset to inherited{inheritedValue ? ` (${inheritedValue})` : ''}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
