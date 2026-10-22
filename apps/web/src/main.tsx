import type { ShellLayout } from '@rampflow/shared/values';
import type { AnyRouteMatch } from '@tanstack/react-router';
import type { TFunction } from 'i18next';
import '@/index.css';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import type { i18n } from 'i18next';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { toast } from 'sonner';
import { errorText } from '@/components/app-shell/form-errors';
import { RouteError, RouteNotFound } from '@/components/app-shell/route-states';
import { ApiFailure, setSuspendedHandler } from '@/lib/api';
import { initI18n } from '@/lib/i18n';
import { queryKeys } from '@/lib/query-keys';
import { cachedDockCodes } from '@/modules/capacity/queries';
import { routeTree } from '@/routeTree.gen';

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
  interface StaticDataRouteOption {
    /** `station`: the tenant layout renders the tablet station layout instead of the office shell. */
    shell?: ShellLayout;
    /** The route's own breadcrumb after the nav item's, e.g. a site's name or a topic. */
    crumb?: (match: AnyRouteMatch, t: TFunction) => string | undefined;
  }
}

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { silent?: boolean };
    queryMeta: { silent?: boolean };
  }
}

const i18nInstance: i18n = await initI18n();
document.documentElement.lang = i18nInstance.language;

/** One toast per failed request, in the user's language; 401 sends the user to sign in. */
function onApiError(error: unknown, silent: boolean | undefined) {
  if (!(error instanceof ApiFailure) || silent) return;
  if (error.status === 401) {
    const here = `${window.location.pathname}${window.location.search}`;
    if (!window.location.pathname.startsWith('/login')) {
      void router.navigate({ to: '/login', search: { redirect: here } });
    }
    return;
  }
  if (error.status === 404) return;
  const t = i18nInstance.getFixedT(null, 'core');
  const codes = cachedDockCodes(queryClient, error.details.dockIds);
  const description = codes.length
    ? t(($) => $.errors.conflict.docks, { codes: codes.join(', ') })
    : undefined;
  toast.error(errorText(t, error), { description });
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (e, query) => onApiError(e, query.meta?.silent) }),
  mutationCache: new MutationCache({
    onError: (e, _vars, _ctx, mutation) => onApiError(e, mutation.meta?.silent),
  }),
  defaultOptions: {
    queries: {
      retry: (count, e) => !(e instanceof ApiFailure && e.status < 500) && count < 2,
    },
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
  defaultErrorComponent: RouteError,
  defaultNotFoundComponent: RouteNotFound,
});

// A suspension answers 403 on the next request (PL-07): refetch every area context and reload
// the route, so the tenant layout's error boundary shows the suspended page.
setSuspendedHandler(() => {
  void queryClient.invalidateQueries({ predicate: (q) => queryKeys.isContext(q.queryKey) });
  void router.invalidate();
});

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('#root element missing from index.html');

createRoot(rootElement).render(
  <StrictMode>
    <I18nextProvider i18n={i18nInstance}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>,
);
