import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { railwayAllowedHosts } from './railway-hosts.mjs';

function railwayApi(): Plugin {
  return {
    name: 'railway-api',
    async configureServer(server) {
      if (!process.env.RAILWAY_ENVIRONMENT && !process.env.RAILWAY_PROJECT_ID) return;
      const { ensureApiUpstream } = await import('./ensure-api.mjs');
      const { trailApiReady } = await import('./api-upstream.mjs');
      const upstream = await ensureApiUpstream();
      const proxy = server.config.server.proxy?.['/api'];
      if (proxy && typeof proxy === 'object') proxy.target = upstream;
      if (await trailApiReady(upstream)) return;
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith('/api')) {
          next();
          return;
        }
        res.statusCode = 503;
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            message: 'The trails API is not running. Set DATABASE_URL and REDIS_URL on the web service.',
          }),
        );
      });
    },
  };
}

const kinds = fileURLToPath(new URL('../../packages/shared/src/kinds.ts', import.meta.url));
const shared = fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url));
const apiTarget = process.env.API_UPSTREAM || process.env.API_BASE_URL || 'http://127.0.0.1:3000';
const proxy = { '/api': { target: apiTarget, changeOrigin: true } };
const port = process.env.PORT ? Number(process.env.PORT) : undefined;
const allowedHosts = railwayAllowedHosts();

export default defineConfig({
  plugins: [react(), railwayApi()],
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
    ...(allowedHosts ? { allowedHosts } : {}),
  },
  preview: {
    host: '0.0.0.0',
    port: port ?? 4173,
    proxy,
    ...(allowedHosts ? { allowedHosts } : {}),
  },
  build: {
    sourcemap: false,
  },
});
