import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Ports come from the environment so parallel checkouts do not collide (scripts/checkout-env.mjs).
const port = (name: string, fallback: number) => Number(process.env[name] ?? fallback);

export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: port('WEB_PORT', 5173),
    strictPort: true,
    proxy: {
      '/api': `http://localhost:${port('API_PORT', 3000)}`,
      '/d': `http://localhost:${port('DRIVER_PORT', 5174)}`,
    },
  },
});
