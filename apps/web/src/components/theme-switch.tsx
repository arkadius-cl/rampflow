import { isValueOf, Theme } from '@rampflow/shared/values';
import type { VariantProps } from 'class-variance-authority';
import { type LucideIcon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import type { toggleVariants } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { ThemeController } from '@/hooks/use-theme';

// "Darstellung: Hell · Dunkel · Wie System" (design/yrd/components/core/ThemeSwitch.jsx), as a
// shadcn toggle group inline and as a radio group inside a dropdown menu.

const OPTIONS: ReadonlyArray<{ value: Theme; icon: LucideIcon }> = [
  { value: Theme.light, icon: SunIcon },
  { value: Theme.dark, icon: MoonIcon },
  { value: Theme.system, icon: MonitorIcon },
];

/** The switch as a segmented toggle group; `size="lg"` for device menus in the hall. */
export function ThemeSwitch({
  theme,
  size,
  className,
}: {
  theme: ThemeController;
  size?: VariantProps<typeof toggleVariants>['size'];
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <ToggleGroup
      value={[theme.value]}
      onValueChange={(next) => {
        const picked = next[0];
        if (isValueOf(Theme, picked)) theme.set(picked);
      }}
      spacing={0}
      size={size}
      aria-label={t(($) => $.shell.theme.label)}
      className={className}
      data-testid="theme-switch"
    >
      {OPTIONS.map(({ value, icon: Icon }) => (
        <ToggleGroupItem key={value} value={value}>
          <Icon aria-hidden />
          {t(($) => $.shell.theme[value])}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** The switch as a submenu of a dropdown menu: the office user menu and the station's device menu. */
export function ThemeMenuItems({ theme }: { theme: ThemeController }) {
  const { t } = useTranslation();
  const Current = OPTIONS.find((o) => o.value === theme.value)?.icon ?? MonitorIcon;
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger data-testid="theme-menu">
        <Current />
        {t(($) => $.shell.theme.label)}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          value={theme.value}
          onValueChange={(value) => (isValueOf(Theme, value) ? theme.set(value) : undefined)}
        >
          {OPTIONS.map(({ value, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon />
              {t(($) => $.shell.theme[value])}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
