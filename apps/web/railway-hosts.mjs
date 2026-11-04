// Vite's dev server rejects Host headers it does not recognize. Railway's public
// domain is one of those headers. Allow it only when this process is on Railway.
export function railwayAllowedHosts(env = process.env) {
  const onRailway = Boolean(
    env.RAILWAY_ENVIRONMENT || env.RAILWAY_PROJECT_ID || env.RAILWAY_PUBLIC_DOMAIN,
  );
  if (!onRailway) return undefined;

  const hosts = new Set(['.up.railway.app']);
  const domain = env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (domain) hosts.add(domain.replace(/:\d+$/, ''));
  for (const key of ['APP_BASE_URL', 'RAILWAY_STATIC_URL']) {
    const raw = env[key];
    if (!raw) continue;
    try {
      hosts.add(new URL(raw.includes('://') ? raw : `https://${raw}`).hostname);
    } catch {
      // A value that is not a host is ignored. The Railway suffix still matches.
    }
  }
  return [...hosts];
}
