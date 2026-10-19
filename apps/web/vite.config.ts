import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Ports come from the environment so parallel checkouts do not collide (scripts/checkout-env.mjs).
const port = (name: string, fallback: number) => Number(process.env[name] ?? fallback);

// The design prototype (routes/design/) is the visual reference in dev. A production build
// generates its own route tree without it, outside src/, so the committed routeTree.gen.ts keeps
// the dev routes and no prototype code or mock data ships.
const PROD_ROUTE_TREE = './node_modules/.tmp/routeTree.prod.gen.ts';

export default defineConfig(({ command }) => {
  const production = command === 'build';
  return {
    plugins: [
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
        ...(production
          ? { routeFileIgnorePattern: '^design$', generatedRouteTree: PROD_ROUTE_TREE }
          : {}),
      }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: [
        ...(production
          ? [
              {
                find: '@/routeTree.gen',
                replacement: path.resolve(import.meta.dirname, PROD_ROUTE_TREE),
              },
            ]
          : []),
        { find: '@', replacement: path.resolve(import.meta.dirname, './src') },
      ],
    },
    server: {
      port: port('WEB_PORT', 5173),
      strictPort: true,
      proxy: {
        '/api': `http://localhost:${port('API_PORT', 3000)}`,
        '/d': `http://localhost:${port('DRIVER_PORT', 5174)}`,
      },
    },
  };
});
