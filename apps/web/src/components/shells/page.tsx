import { PageWidth } from '@rampflow/shared/values';
import { Link } from '@tanstack/react-router';
import type { ComponentProps, ReactNode } from 'react';
import { tabTriggerClass } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

// The frame of every office page (ADR-0022): title, description and actions share one container
// with the content, and the container's width follows the pattern, never the page.

const widthClass: Record<PageWidth, string> = {
  [PageWidth.full]: '',
  [PageWidth.wide]: 'mx-auto max-w-page-wide',
  [PageWidth.narrow]: 'mx-auto max-w-page-narrow',
};

export interface PageProps {
  width: PageWidth;
  title: string;
  description?: string;
  /** Right of the title: at most one primary button, otherwise secondary buttons and badges. */
  actions?: ReactNode;
  /** The second navigation level under the title: `PageTabs` or a view switcher. */
  tabs?: ReactNode;
  /** `sr-only` keeps the h1 for the document when the screen draws its own title (plan board). */
  titleHidden?: boolean;
  className?: string;
  children: ReactNode;
}

export function Page({
  width,
  title,
  description,
  actions,
  tabs,
  titleHidden,
  className,
  children,
}: PageProps) {
  return (
    <div className={cn('flex w-full min-w-0 flex-col gap-4', widthClass[width], className)}>
      <PageHeader
        title={title}
        description={description}
        actions={actions}
        className={titleHidden ? 'sr-only' : undefined}
      />
      {tabs}
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * The topics of an entity page as routed line tabs (ADR-0015, ADR-0022). Each tab is a real link,
 * so it opens with Enter and in a new tab; the current one carries `aria-current="page"`.
 */
export function PageTabs({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1 border-b border-border">
      {children}
    </nav>
  );
}

export function PageTab({ className, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props} className={cn(tabTriggerClass.base, tabTriggerClass.line, className)} />;
}
