import type { Density } from '@rampflow/shared/values';
import { useEffect } from 'react';

/**
 * Sets `data-density` on <html> while the shell is mounted (ADR-0021): the density tokens cascade
 * from the root, so dialogs and menus rendered through a portal get the same sizes as the page.
 * The office is the absence of the attribute.
 */
export function useDensity(density: Density): void {
  useEffect(() => {
    document.documentElement.dataset.density = density;
    return () => {
      delete document.documentElement.dataset.density;
    };
  }, [density]);
}
