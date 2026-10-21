import { StaffLocale } from '@rampflow/shared/values';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type RenderOptions, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { Toaster } from '@/components/ui/sonner';
import { applyLocale, initI18n } from '@/lib/i18n';

// Component tests render in English with the real catalogs, so they assert what users read.

export const i18n = await initI18n();
await applyLocale(i18n, StaffLocale.en);

export function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        {children}
        <Toaster />
      </I18nextProvider>
    </QueryClientProvider>
  );
}

export const renderUi = (ui: ReactNode, options?: RenderOptions) =>
  render(ui, { wrapper: Providers, ...options });
