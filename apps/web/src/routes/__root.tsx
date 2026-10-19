import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

const Devtools = import.meta.env.DEV ? lazy(() => import('@/devtools')) : () => null;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <TooltipProvider>
      <Outlet />
      <Toaster />
      <Suspense>
        <Devtools />
      </Suspense>
    </TooltipProvider>
  );
}
