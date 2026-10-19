import '@/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { App } from '@/app';
import { initI18n } from '@/lib/i18n';
import { boot } from '@/lib/session';

const booted = boot();
const i18n = await initI18n();
const root = document.getElementById('root');
if (!root) throw new Error('index.html has no #root');

createRoot(root).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <App booted={booted} />
    </I18nextProvider>
  </StrictMode>,
);
