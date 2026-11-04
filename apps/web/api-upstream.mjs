// The public map calls /api on the web host. That request has to reach the
// trails API, not a stand-in that only answers /health.
export function isTrailApi(body) {
  return Boolean(body) && (body.status === 'ok' || body.status === 'error') && 'db' in body && 'redis' in body;
}

export function configuredUpstream(env = process.env) {
  const explicit = env.API_UPSTREAM || env.API_BASE_URL;
  if (!explicit) return 'http://127.0.0.1:3000';
  try {
    const url = new URL(explicit);
    const own = env.RAILWAY_PUBLIC_DOMAIN;
    if (own && url.hostname === own) return 'http://127.0.0.1:3000';
    return url.origin;
  } catch {
    return 'http://127.0.0.1:3000';
  }
}

export async function chooseUpstream(env = process.env, ready = async () => false) {
  const configured = configuredUpstream(env);
  const onRailway = Boolean(env.RAILWAY_ENVIRONMENT || env.RAILWAY_PROJECT_ID);
  if (!onRailway) return configured;
  if (await ready(configured)) return configured;

  const ports = [];
  for (const port of [env.PORT, '3000', '8080']) {
    if (port && !ports.includes(String(port))) ports.push(String(port));
  }
  for (const port of ports) {
    const candidate = `http://api.railway.internal:${port}`;
    if (candidate !== configured && (await ready(candidate))) return candidate;
  }
  return 'http://127.0.0.1:3000';
}

export async function trailApiReady(base) {
  try {
    const response = await globalThis.fetch(new URL('/api/health', base), {
      signal: globalThis.AbortSignal.timeout(2000),
    });
    const body = await response.json();
    return isTrailApi(body);
  } catch {
    return false;
  }
}
