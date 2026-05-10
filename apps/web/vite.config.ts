import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';

export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  test: {
    // Default to node so MSW + ky work cleanly. Component tests in feature
    // slices that render React should override via a per-file docblock:
    //   // @vitest-environment jsdom
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
