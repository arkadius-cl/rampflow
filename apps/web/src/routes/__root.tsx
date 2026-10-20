import { ViteMode } from '@rampflow/shared/values';
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet, useRouterState } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

const Devtools = import.meta.env.DEV ? lazy(() => import('@/devtools')) : () => null;

export interface RootContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RootContext>()({
  component: RootLayout,
});

function RootLayout() {
  // Design prototype screens are screenshotted; keep the devtools overlays out of them.
  const isDesign = useRouterState({ select: (s) => s.location.pathname.startsWith('/design') });
  return (
    <TooltipProvider>
      <Outlet />
      {/* Sheets and dialogs keep their actions bottom right; toasts there would cover them. */}
      <Toaster position="top-center" />
      {isDesign || import.meta.env.MODE === ViteMode.e2e ? null : (
        <Suspense>
          <Devtools />
        </Suspense>
      )}
    </TooltipProvider>
  );
}
