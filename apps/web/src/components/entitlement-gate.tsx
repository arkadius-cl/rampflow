import { EntitlementState } from '@rampflow/shared/modules/core/values';
import { LockIcon, SparklesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface UpsellHintProps {
  feature: string;
  packageName: string;
  /** One sentence on what the feature does for this tenant. */
  benefit: string;
  className?: string;
  compact?: boolean;
}

/**
 * Shown in place of a feature the package does not include, only on pages
 * where the reader can act on it (tenant admin). Operators and carriers
 * never see upsell copy; for them the feature is simply absent.
 */
export function UpsellHint({ feature, packageName, benefit, className, compact }: UpsellHintProps) {
  return (
    <div
      role="note"
      className={cn(
        'flex items-start gap-3 rounded-lg border border-dashed bg-muted/40 text-sm',
        compact ? 'px-3 py-2' : 'p-4',
        className,
      )}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background">
        <LockIcon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium">
          {feature} is part of {packageName}
        </div>
        <p className="text-muted-foreground">{benefit}</p>
      </div>
      {compact ? null : (
        <Button variant="outline" size="sm">
          <SparklesIcon />
          Ask about {packageName}
        </Button>
      )}
    </div>
  );
}

export interface EntitlementGateProps extends Omit<UpsellHintProps, 'className'> {
  state: EntitlementState;
  children: React.ReactNode;
}

/** `on` renders children, `off` renders nothing, `upsell` renders the hint instead. */
export function EntitlementGate({ state, children, ...hint }: EntitlementGateProps) {
  if (state === EntitlementState.on) return children;
  if (state === EntitlementState.off) return null;
  return <UpsellHint {...hint} />;
}
