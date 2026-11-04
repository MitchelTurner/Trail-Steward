import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./dist', import.meta.url));
const port = Number(process.env.PORT || 4173);
const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
const upstream = new URL(
  onRailway
    ? await (await import('./ensure-api.mjs')).ensureApiUpstream()
    : process.env.API_UPSTREAM || process.env.API_BASE_URL || 'http://127.0.0.1:3000',
);
const forward = upstream.protocol === 'https:' ? httpsRequest : httpRequest;

const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function fileFor(pathname) {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  const full = resolve(root, rel);
  if (full !== root && !full.startsWith(root + sep)) return null;
  if (rel && existsSync(full) && statSync(full).isFile()) return full;
  if (extname(rel)) return null;
  return join(root, 'index.html');
}

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname.startsWith('/api')) {
    const proxy = forward(
      {
        protocol: upstream.protocol,
        hostname: upstream.hostname,
        port: upstream.port || (upstream.protocol === 'https:' ? 443 : 80),
        method: req.method,
        path: `${url.pathname}${url.search}`,
        headers: { ...req.headers, host: upstream.host },
      },
      (proxied) => {
        res.writeHead(proxied.statusCode || 502, proxied.headers);
        proxied.pipe(res);
      },
    );
    proxy.on('error', () => {
      if (!res.headersSent) res.writeHead(502);
      res.end('The directory is unavailable right now.');
    });
    req.pipe(proxy);
    return;
  }

  const file = fileFor(url.pathname);
  if (!file || !existsSync(file)) {
    res.writeHead(404);
    res.end('Not found.');
    return;
  }
  res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Web listening on ${port}`);
});
