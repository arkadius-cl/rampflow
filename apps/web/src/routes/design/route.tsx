import { Density, ThemeSurface } from '@rampflow/shared/values';
import { createFileRoute, notFound, Outlet } from '@tanstack/react-router';
import { useState } from 'react';
import { ThemeSwitch } from '@/components/theme-switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useDeviceTheme } from '@/hooks/use-theme';

// Design prototype routes exist in dev builds only. Production answers 404.
export const Route = createFileRoute('/design')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: DesignLayout,
});

/** The office is the absence of `data-density`; the toggle needs a value for it. */
const OFFICE = 'office';
type DensityChoice = Density | typeof OFFICE;

/**
 * A reviewer's bar over every prototype screen: the appearance (kept on this device) and a density
 * override, so each state of the design system can be seen without a station or a phone.
 */
function DesignLayout() {
  const theme = useDeviceTheme(ThemeSurface.office);
  const [density, setDensity] = useState<DensityChoice | undefined>(undefined);
  return (
    <>
      <div
        role="toolbar"
        aria-label="Design review"
        className="fixed right-3 bottom-3 z-50 flex items-center gap-2 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-md print:hidden"
      >
        <ThemeSwitch theme={theme} size="sm" />
        <ToggleGroup
          value={density ? [density] : []}
          onValueChange={(next) => {
            const picked = next[0];
            if (picked === OFFICE || picked === Density.halle || picked === Density.fahrer) {
              setDensity(picked);
              if (picked === OFFICE) delete document.documentElement.dataset.density;
              else document.documentElement.dataset.density = picked;
            } else setDensity(undefined);
          }}
          spacing={0}
          size="sm"
          aria-label="Density"
        >
          <ToggleGroupItem value={OFFICE}>Office</ToggleGroupItem>
          <ToggleGroupItem value={Density.halle}>Halle</ToggleGroupItem>
          <ToggleGroupItem value={Density.fahrer}>Fahrer</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <Outlet />
    </>
  );
}
