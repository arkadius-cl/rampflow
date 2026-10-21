import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import type { FunctionComponent } from 'react';
import { Providers } from './render.tsx';

/**
 * Renders a memory-history router with the given pages, starting at `url`, inside the test
 * providers. Returns the router, so a test can navigate as a link or the back button would.
 */
export function renderRoutes(pages: Record<string, FunctionComponent>, url: string) {
  const root = createRootRoute({ component: Outlet });
  const routes = Object.entries(pages).map(([path, component]) =>
    createRoute({ getParentRoute: () => root, path, component }),
  );
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  const view = render(<RouterProvider router={router} />, { wrapper: Providers });
  return { router, ...view };
}
