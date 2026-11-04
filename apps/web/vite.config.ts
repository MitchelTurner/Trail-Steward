import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const kinds = fileURLToPath(new URL('../../packages/shared/src/kinds.ts', import.meta.url));
const shared = fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url));
const apiTarget = process.env.API_UPSTREAM || process.env.API_BASE_URL || 'http://127.0.0.1:3000';
const proxy = { '/api': { target: apiTarget, changeOrigin: true } };
const port = process.env.PORT ? Number(process.env.PORT) : undefined;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^shared\/kinds$/, replacement: kinds },
      { find: /^shared$/, replacement: shared },
    ],
  },
  server: {
    host: '0.0.0.0',
    port: port ?? 5173,
    proxy,
  },
  preview: {
    host: '0.0.0.0',
    port: port ?? 4173,
    proxy,
  },
  build: {
    sourcemap: false,
  },
});
