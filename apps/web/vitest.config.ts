import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  test: {
    // Component tests render into a DOM; the pure tests do not mind it.
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
