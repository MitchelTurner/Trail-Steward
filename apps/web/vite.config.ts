import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const kinds = fileURLToPath(new URL('../../packages/shared/src/kinds.ts', import.meta.url));
const shared = fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^shared\/kinds$/, replacement: kinds },
      { find: /^shared$/, replacement: shared },
    ],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true },
    },
  },
  build: {
    sourcemap: false,
  },
});
