import type { SettingKey } from '@rampflow/shared';
import type { SettingEntry } from '@rampflow/shared/modules/core/api.settings';
import { SettingScope, SettingSource } from '@rampflow/shared/values';
import { Link, useLocation } from '@tanstack/react-router';
import { LinkIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fieldIds } from '@/modules/core/setting-input';
import type { OriginLink } from '@/modules/core/settings-levels';

// One settings field (TN-02, PL-03, ADR-0020): the title is the field's anchor, the origin says
// as text where the value comes from, and "Copy link" copies the deep link to it.

export interface SettingOriginProps {
  entry: SettingEntry;
  /** The level the page edits. */
  scope: SettingScope;
  /** The inherited value as text, for "Inherited: …". */
  inheritedText: string;
  /** The field will drop its value on this level when the form is saved. */
  pendingInherit?: boolean;
  /** Links a value from a level above to its source; build it with `originLinkFor`. */
  originLink?: OriginLink;
}

/** Where the field's value comes from, relative to the page's level (design decision 6). */
export function SettingOrigin({
  entry,
  scope,
  inheritedText,
  pendingInherit = false,
  originLink,
}: SettingOriginProps) {
  const { t } = useTranslation();
  const source = pendingInherit ? entry.inherited.source : entry.source;
  const setHere = source === scope;
  const fromText = (s: SettingSource) =>
    s === SettingSource.site
      ? t(($) => $['settings-ui'].origin.here.site)
      : t(($) => $['settings-ui'].origin[s]);
  const link =
    setHere || source === SettingSource.default ? undefined : originLink?.(source, entry.key);
  const levelsHint =
    entry.scopes.length === 1 && entry.scopes[0] === SettingScope.platform
      ? t(($) => $['settings-ui'].levels.platform_only)
      : scope === SettingScope.tenant && !entry.scopes.includes(SettingScope.site)
        ? t(($) => $['settings-ui'].levels.all_sites)
        : null;

  return (
    <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
      <p data-testid="setting-origin">
        {setHere ? (
          <span className="font-medium text-tone-planned">
            {t(($) => $['settings-ui'].origin.here[scope])}
          </span>
        ) : link ? (
          <Link
            {...link}
            className="font-medium underline underline-offset-2 hover:text-foreground"
          >
            {fromText(source)}
          </Link>
        ) : (
          <span className="font-medium">{fromText(source)}</span>
        )}
        {setHere ? (
          <>
            {' · '}
            {t(($) => $['settings-ui'].origin.inherited, {
              value: inheritedText,
              source: fromText(entry.inherited.source),
            })}
          </>
        ) : null}
        {pendingInherit ? (
          <>
            {' · '}
            {t(($) => $['settings-ui'].origin.pending_inherit)}
          </>
        ) : null}
      </p>
      {levelsHint ? <p>{levelsHint}</p> : null}
    </div>
  );
}

export interface SettingFieldProps {
  settingKey: SettingKey;
  label: string;
  description: string;
  /** The value is set on the page's level (and stays so after saving). */
  overridden: boolean;
  control: ReactNode;
  error?: string;
  origin: ReactNode;
  /** "Use inherited value", when the field has one to offer. */
  action?: ReactNode;
  /** The control is a group of checkboxes, named by the title rather than by a label. */
  group?: boolean;
  /** The control takes the whole row under the title: a long checklist in columns (ADR-0022). */
  wide?: boolean;
}

/** One settings row: title and help on the left, control, origin and actions on the right. */
export function SettingField({
  settingKey,
  label,
  description,
  overridden,
  control,
  error,
  origin,
  action,
  group = false,
  wide = false,
}: SettingFieldProps) {
  const { t } = useTranslation();
  const ids = fieldIds(settingKey);
  const pathname = useLocation({ select: (l) => l.pathname });
  const copyLink = async () => {
    const url = new URL(`${pathname}#${settingKey}`, window.location.origin);
    await navigator.clipboard.writeText(url.href);
    toast.success(t(($) => $['settings-ui'].link_copied));
  };
  return (
    <div
      data-setting={settingKey}
      className={cn(
        'grid gap-3 py-4 transition-colors data-highlighted:bg-tone-planned-bg md:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]',
        overridden && 'border-l-2 border-l-tone-planned pl-3 md:-ml-3',
      )}
    >
      <div className="min-w-0">
        <h3
          id={ids.title}
          tabIndex={-1}
          className="scroll-mt-24 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {group ? label : <label htmlFor={ids.input}>{label}</label>}
        </h3>
        <p id={ids.description} className="mt-0.5 text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      <div className={cn('flex min-w-0 flex-col gap-1.5', wide && 'md:col-span-2')}>
        {control}
        {error ? (
          <p id={ids.error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex min-h-6 flex-wrap items-start justify-between gap-2">
          {origin}
          <div className="flex items-center gap-1">
            {action}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              aria-label={t(($) => $['settings-ui'].copy_link, { label })}
              onClick={() => void copyLink()}
            >
              <LinkIcon />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
