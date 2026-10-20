import type { ServerResponse } from 'node:http';
import { isIP } from 'node:net';
import path from 'node:path';
import { ImageContentType } from '@rampflow/shared/values';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { type Connect, defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// The driver PWA under /d (ADR-0008). In development apps/web's dev server proxies /d here, so
// the PWA and /api share one origin; production serves dist/ from the API at /d/.
const port = (name: string, fallback: number) => Number(process.env[name] ?? fallback);
const driverPort = port('DRIVER_PORT', 5174);
// Dev listens on every interface so phones in the LAN can open it. Vite accepts IP addresses and
// localhost; a DEV_HOST name (scripts/checkout-env.mjs) must be allowed by name.
const devHost = process.env.DEV_HOST;
const allowedHosts = devHost && !isIP(devHost) ? [devHost] : [];

/** Links are `/d#<token>`; Vite serves only under `/d/`. The browser keeps the fragment. */
const slashRedirect: Plugin = {
  name: 'driver-slash-redirect',
  configureServer: (server) => {
    server.middlewares.use(redirectBare);
  },
  configurePreviewServer: (server) => {
    server.middlewares.use(redirectBare);
  },
};
const BARE = '/d';
function redirectBare(req: Connect.IncomingMessage, res: ServerResponse, next: () => void) {
  if (req.url !== BARE && !req.url?.startsWith(`${BARE}?`)) return next();
  res.writeHead(302, { Location: `/d/${req.url.slice(2)}` });
  res.end();
}

export default defineConfig({
  base: '/d/',
  plugins: [
    slashRedirect,
    react(),
    tailwindcss(),
    VitePWA({
      injectRegister: 'script',
      registerType: 'autoUpdate',
      manifest: {
        name: 'rampflow driver',
        short_name: 'rampflow',
        start_url: '/d/',
        scope: '/d/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#171717',
        icons: [{ src: 'icon.svg', sizes: 'any', type: ImageContentType.svg, purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/d/index.html',
        navigateFallbackAllowlist: [/^\/d(\/|$)/],
        runtimeCaching: [
          {
            // DR-03 offline: the last booking state of this phone's cookie.
            // Workbox copies this function's source into sw.js, so it cannot use imports.
            urlPattern: ({ url, request }) =>
              // biome-ignore lint/plugin: serialized into the service worker, where HttpMethod does not exist
              request.method === 'GET' && url.pathname === '/api/driver/booking',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'driver-booking',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 1 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: [{ find: '@', replacement: path.resolve(import.meta.dirname, './src') }],
  },
  server: {
    host: true,
    allowedHosts,
    port: driverPort,
    strictPort: true,
    // The page runs on the web dev server's origin; hot reload talks to this server directly.
    hmr: { clientPort: driverPort },
    headers: { 'Referrer-Policy': 'no-referrer' },
    proxy: { '/api': `http://localhost:${port('API_PORT', 3000)}` },
  },
  // The production build with the API's /d headers (kernel/static.ts), for the budget, first
  // render and service worker checks in e2e/driver. Next to the dev server in the port block.
  preview: {
    port: driverPort + 1,
    strictPort: true,
    headers: {
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; connect-src 'self'",
    },
    // The API accepts writes from APP_ORIGIN only; the preview stands in for that origin.
    proxy: {
      '/api': {
        target: `http://localhost:${port('API_PORT', 3000)}`,
        headers: { Origin: process.env.APP_ORIGIN ?? 'http://localhost:5173' },
      },
    },
  },
  build: { target: 'es2023' },
});
