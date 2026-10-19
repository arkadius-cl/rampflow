import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet, useRouterState } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

const Devtools = import.meta.env.DEV ? lazy(() => import('@/devtools')) : () => null;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
});

function RootLayout() {
  // Design prototype screens are screenshotted; keep the devtools overlays out of them.
  const isDesign = useRouterState({ select: (s) => s.location.pathname.startsWith('/design') });
  return (
    <TooltipProvider>
      <Outlet />
      <Toaster />
      {isDesign ? null : (
        <Suspense>
          <Devtools />
        </Suspense>
      )}
    </TooltipProvider>
  );
}
